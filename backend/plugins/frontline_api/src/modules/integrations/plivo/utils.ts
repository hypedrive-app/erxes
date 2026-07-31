import * as crypto from 'crypto';
import { getPlivoCallbackBaseUrl } from '@/integrations/plivo/callbackUrl';
import {
  PLIVO_API_BASE_URL,
  PLIVO_DEFAULT_RING_TIMEOUT_SECONDS,
  PLIVO_DEFAULT_TIME_LIMIT_SECONDS,
} from '@/integrations/plivo/constants';
import {
  debugError,
  debugExternalRequests,
} from '@/integrations/plivo/debuggers';
import {
  IPlivoEndpoint,
  IPlivoEndpointCreateResponse,
  IPlivoEndpointListItem,
  IPlivoEndpointListResponse,
  IPlivoOutboundCallResponse,
} from '@/integrations/plivo/@types';

/**
 * A failed Plivo REST call, carrying the HTTP status so callers can tell an
 * auth failure (401) from a bad request (400) without matching message text.
 * https://www.plivo.com/docs/voice/api/response-codes
 */
export class PlivoApiError extends Error {
  public readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PlivoApiError';
    this.status = status;
  }

  /** The auth id or token is wrong; the integration must be reconnected. */
  public get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /**
   * True when the request was fine and only rate limiting or a transient Plivo
   * fault rejected it, so the same payload can be sent again after a backoff.
   * A 4xx other than 429 is permanent for the request as written.
   */
  public get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

interface IPlivoRequestArgs {
  authId: string;
  authToken: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
}

const parseResponseBody = (raw: string) => {
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
};

/**
 * Single entry point for Plivo REST calls.
 *
 * Authentication is HTTP Basic with `auth_id:auth_token`. The token is never
 * logged — only the method and path are — because the same token is the HMAC
 * key that verifies inbound callbacks, so leaking it into logs would let anyone
 * forge a webhook.
 *
 * @param path - account-relative, e.g. `/Call/`; the account segment is added
 */
export const plivoRequest = async <T = Record<string, unknown>>({
  authId,
  authToken,
  method,
  path,
  body,
}: IPlivoRequestArgs): Promise<T> => {
  const url = `${PLIVO_API_BASE_URL}/Account/${authId}${path}`;

  debugExternalRequests(`Plivo ${method} ${url}`);

  const credentials = Buffer.from(`${authId}:${authToken}`).toString('base64');

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = parseResponseBody(await response.text());

  if (!response.ok) {
    throw new PlivoApiError(
      response.status,
      `Plivo API error ${response.status}: ${
        data?.error || data?.message || response.statusText
      }`,
    );
  }

  return data as T;
};

/**
 * Builds the string Plivo signs, per the V3 algorithm.
 *
 * Ported from Plivo's own `construct_post_url` / `construct_get_url`
 * (plivo-python, `plivo/utils/signature_v3.py`) rather than from the prose
 * documentation, which does not spell out the `?` below.
 *
 * A POST signs the URL, then a literal `?`, then every parameter in ascending
 * case-sensitive key order as bare `key + value` pairs with no separator
 * between them, then `'.' + nonce`.
 *
 * That `?` is easy to miss and is the whole ballgame: their
 * `construct_get_url` appends `'?' + query_params` whenever the POST body is
 * non-empty, and `query_params` is the empty string on this path, so a bare
 * `?` lands between the path and the parameters. Omitting it produces a
 * perfectly plausible digest that never matches, and Plivo's only feedback is
 * a 403 on the answer webhook — which reads as an unreachable URL and kills
 * the call.
 *
 * A GET signs the URL with its query string, plus the nonce; its parameters
 * are already in the URL.
 * https://www.plivo.com/docs/voice/concepts/signature-validation
 */
const buildV3SignatureBase = (
  method: string,
  uri: string,
  nonce: string,
  params: Record<string, string>,
): string => {
  let base = uri;

  if (method.toUpperCase() === 'POST') {
    const keys = Object.keys(params).sort();

    // Present even when there are no parameters to follow it, matching
    // construct_get_url's `len(query_params) > 0 or not empty_post_params`.
    if (keys.length) {
      base += '?';
    }

    // Sorted with the default comparator: byte order, i.e. case-sensitive, so
    // uppercase keys sort before lowercase ones. Plivo sorts the same way and a
    // locale-aware sort would silently produce a different digest.
    for (const key of keys) {
      base += key + params[key];
    }
  }

  return `${base}.${nonce}`;
};

/**
 * Verifies one candidate signature in constant time.
 *
 * Both values are compared as raw bytes; `timingSafeEqual` throws when the
 * lengths differ, which itself leaks length, so the length is checked first.
 */
const matchesSignature = (expected: string, received: string): boolean => {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

/**
 * Validates the `X-Plivo-Signature-V3` header sent with every callback.
 *
 * Returns false rather than throwing so the caller decides the response code.
 *
 * The header may hold SEVERAL comma-separated signatures: an account with more
 * than one auth token gets one signature per token, and only the one matching
 * the token we hold will verify. Rejecting because the first entry does not
 * match would break every multi-token account, so the request is accepted if
 * ANY entry matches.
 *
 * @param method - the HTTP method of the callback request
 * @param uri - the full URL Plivo requested, exactly as configured on the
 *   application; a proxy that rewrites scheme or host will break the digest
 * @param nonce - value of the `X-Plivo-Signature-V3-Nonce` header
 * @param authToken - the account auth token, used as the HMAC key
 * @param signatureHeader - value of the signature header, possibly multi-valued
 * @param params - the POST form parameters; ignored for GET
 */
export const validatePlivoSignature = (
  method: string,
  uri: string,
  nonce: string | undefined,
  authToken: string | undefined,
  signatureHeader: string | undefined,
  params: Record<string, string>,
): boolean => {
  if (!authToken || !nonce || !signatureHeader || !uri) {
    // Nothing to verify against. Treated as a failure so a misconfigured
    // integration cannot silently accept unauthenticated callbacks.
    return false;
  }

  const base = buildV3SignatureBase(method, uri, nonce, params);

  const expected = crypto
    .createHmac('sha256', authToken)
    .update(base)
    .digest('base64');

  const received = signatureHeader
    .split(',')
    .map((signature) => signature.trim())
    .filter(Boolean);

  // Every candidate is checked even after a match so the work done does not
  // depend on which position matched.
  return received.reduce(
    (matched, signature) => matchesSignature(expected, signature) || matched,
    false,
  );
};

/**
 * Reconstructs the URL Plivo signed.
 *
 * The digest covers the URL as PLIVO requested it, which is the address
 * registered on the application — NOT the address this process was reached on.
 * The two differ in a deployed stack: the gateway proxies
 * `/pl:frontline/plivo/answer` after rewriting the path down to `/plivo/answer`,
 * and forwards neither the stripped prefix nor `x-forwarded-host`. Rebuilding
 * the URL from the request therefore yields `https://<internal-host>/plivo/answer`,
 * whose digest cannot match, and every genuine callback is rejected as a forgery.
 *
 * So the public base is taken from configuration — the very value registered
 * with Plivo — and only the webhook's own sub-path and query string are taken
 * from the request. The query string is included because it is part of the URL
 * for GET callbacks.
 *
 * @param subdomain - tenant the callback arrived for; selects that tenant's
 *   configured public URL
 */
export const buildCallbackUrl = (
  req: {
    path?: string;
    originalUrl?: string;
    url?: string;
  },
  subdomain: string,
): string => {
  const requestUrl = req.originalUrl || req.url || '';
  // Only the FIRST `?` separates the query string; a later one is part of it.
  const queryStart = requestUrl.indexOf('?');
  const query = queryStart === -1 ? '' : requestUrl.slice(queryStart + 1);

  // `req.path` is the route below the router's mount point, e.g. `/answer`,
  // with the query string already removed by Express.
  const route = req.path || requestUrl.split('?')[0];

  const base = getPlivoCallbackBaseUrl(subdomain).replace(/\/+$/, '');

  return `${base}${route}${query ? `?${query}` : ''}`;
};

/**
 * Escapes text destined for a PlivoXML element.
 *
 * Callback parameters can end up inside `<Speak>`, and an unescaped `<` or `&`
 * from a caller id or SIP header would produce XML Plivo cannot parse — it
 * hangs up with INVALID_ANSWER_XML rather than reporting an error.
 */
export const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Places an outbound call.
 *
 * `answerUrl` must return PlivoXML describing what to do once the callee picks
 * up; Plivo fetches it at answer time, not now, so a broken answer URL surfaces
 * as a dropped call rather than an error here.
 *
 * @returns Plivo's request uuid, which identifies the request rather than the
 *   call — the CallUUID only exists once the call is actually created and
 *   arrives on the first callback.
 * https://www.plivo.com/docs/voice/api/call#create-an-outbound-call
 */
export const createPlivoCall = async ({
  authId,
  authToken,
  from,
  to,
  answerUrl,
  hangupUrl,
  ringUrl,
  callerName,
  timeLimit,
  ringTimeout,
}: {
  authId: string;
  authToken: string;
  from: string;
  to: string;
  answerUrl: string;
  hangupUrl?: string;
  ringUrl?: string;
  callerName?: string;
  timeLimit?: number;
  ringTimeout?: number;
}): Promise<string> => {
  const body: Record<string, unknown> = {
    from,
    to,
    answer_url: answerUrl,
    answer_method: 'POST',
    time_limit: timeLimit || PLIVO_DEFAULT_TIME_LIMIT_SECONDS,
    ring_timeout: ringTimeout || PLIVO_DEFAULT_RING_TIMEOUT_SECONDS,
  };

  if (hangupUrl) {
    body.hangup_url = hangupUrl;
    body.hangup_method = 'POST';
  }

  if (ringUrl) {
    body.ring_url = ringUrl;
    body.ring_method = 'POST';
  }

  if (callerName) {
    body.caller_name = callerName;
  }

  const response = await plivoRequest<IPlivoOutboundCallResponse>({
    authId,
    authToken,
    method: 'POST',
    path: '/Call/',
    body,
  });

  return response?.request_uuid || '';
};

/**
 * Ends a call that is still in progress.
 *
 * A call that already ended returns 404, which is the desired outcome here, so
 * it is swallowed rather than surfaced as a failure to hang up.
 * https://www.plivo.com/docs/voice/api/call#hangup-a-specific-call
 */
export const hangupPlivoCall = async ({
  authId,
  authToken,
  callUuid,
}: {
  authId: string;
  authToken: string;
  callUuid: string;
}): Promise<void> => {
  try {
    await plivoRequest({
      authId,
      authToken,
      method: 'DELETE',
      path: `/Call/${callUuid}/`,
    });
  } catch (e: any) {
    if (e instanceof PlivoApiError && e.status === 404) {
      return;
    }

    debugError(`Failed to hang up Plivo call ${callUuid}: ${e.message}`);

    throw e;
  }
};

/**
 * Creates a SIP endpoint.
 *
 * A browser client can only register — and only be reached by
 * `<Dial><User>` — when an endpoint exists, so one has to be provisioned before
 * an access token for it is worth minting.
 *
 * Plivo APPENDS a 12-digit number to the username it is given, so the name that
 * actually registers is the one in the response, never the one requested. The
 * requested part must be alphanumeric, 1-25 characters, and start with a letter.
 * https://www.plivo.com/docs/voice/api/endpoints
 *
 * @returns the endpoint as Plivo created it, with its real username
 */
export const createPlivoEndpoint = async ({
  authId,
  authToken,
  username,
  password,
  alias,
  appId,
}: {
  authId: string;
  authToken: string;
  username: string;
  password: string;
  alias: string;
  appId?: string;
}): Promise<IPlivoEndpoint> => {
  const body: Record<string, unknown> = { username, password, alias };

  if (appId) {
    body.app_id = appId;
  }

  const response = await plivoRequest<IPlivoEndpointCreateResponse>({
    authId,
    authToken,
    method: 'POST',
    path: '/Endpoint/',
    body,
  });

  return {
    endpointId: response.endpoint_id || '',
    username: response.username || username,
    alias: response.alias || alias,
  };
};

/**
 * Sets a new password on an existing SIP endpoint.
 *
 * Plivo has no way to read a password back: `GET /Endpoint/{id}/` DOES return a
 * `password` field, but it is stale — logging in with the value it returns
 * fails with `Authentication Error`, while the value just POSTed here works.
 * The password is therefore write-only and the caller must persist what it
 * passed in; this helper deliberately returns nothing to read.
 *
 * A successful update answers `{"message":"changed"}`.
 * https://www.plivo.com/docs/voice/api/endpoints#update-an-endpoint
 */
export const updatePlivoEndpointPassword = async ({
  authId,
  authToken,
  endpointId,
  password,
}: {
  authId: string;
  authToken: string;
  endpointId: string;
  password: string;
}): Promise<void> => {
  await plivoRequest({
    authId,
    authToken,
    method: 'POST',
    path: `/Endpoint/${endpointId}/`,
    body: { password },
  });
};

/**
 * Normalises Plivo's `sip_registered`.
 *
 * Plivo's attribute table types this field as a STRING carrying `'true'` or
 * `'false'`, so a truthiness test would read the string `'false'` as registered
 * and make every provisioned endpoint look reachable. Absent stays undefined —
 * "unknown", which the caller deliberately does not treat as online.
 * https://www.plivo.com/docs/voice/api/endpoints
 */
const readSipRegistered = (value?: string | boolean): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return value.toLowerCase() === 'true';
};

const toPlivoEndpoint = (item: IPlivoEndpointListItem): IPlivoEndpoint => ({
  endpointId: item.endpoint_id || '',
  username: item.username || '',
  alias: item.alias || '',
  sipRegistered: readSipRegistered(item.sip_registered),
});

/**
 * Lists every SIP endpoint on the account.
 *
 * One call serves both the alias lookup and the reachability check, because the
 * list response already carries `sip_registered` — asking per endpoint would
 * mean an extra round trip per agent while a caller waits on the line.
 */
export const listPlivoEndpoints = async ({
  authId,
  authToken,
}: {
  authId: string;
  authToken: string;
}): Promise<IPlivoEndpoint[]> => {
  const response = await plivoRequest<IPlivoEndpointListResponse>({
    authId,
    authToken,
    method: 'GET',
    path: '/Endpoint/',
  });

  return (response.objects || []).map(toPlivoEndpoint);
};

/**
 * Finds an existing endpoint by its alias.
 *
 * The alias is the only field we control that survives creation unchanged —
 * Plivo rewrites the username — so it is what identifies an endpoint we already
 * provisioned for a given agent and integration.
 */
export const findPlivoEndpointByAlias = async ({
  authId,
  authToken,
  alias,
}: {
  authId: string;
  authToken: string;
  alias: string;
}): Promise<IPlivoEndpoint | null> => {
  const endpoints = await listPlivoEndpoints({ authId, authToken });

  const match = endpoints.find((endpoint) => endpoint.alias === alias);

  if (!match) {
    return null;
  }

  return { ...match, alias: match.alias || alias };
};

/**
 * Confirms credentials work by reading the account back.
 *
 * Used before an integration is stored so a mistyped token surfaces in the
 * connect form instead of as calls that never connect.
 * https://www.plivo.com/docs/account/api/account
 */
export const getPlivoAccount = async ({
  authId,
  authToken,
}: {
  authId: string;
  authToken: string;
}): Promise<{ name?: string; account_type?: string; city?: string }> =>
  await plivoRequest<{ name?: string; account_type?: string; city?: string }>({
    authId,
    authToken,
    method: 'GET',
    path: '/',
  });
