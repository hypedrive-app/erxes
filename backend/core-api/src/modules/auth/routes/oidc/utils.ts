import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import { redis } from 'erxes-api-shared/utils';

import {
  OidcConfig,
  tokenEndpoint,
  userInfoEndpoint,
} from './config';

const STATE_PREFIX = 'oidc_state_';
const STATE_TTL_SECONDS = 600;

export type OidcProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

/** Base64url, as PKCE requires (RFC 7636 §4.2). */
const base64url = (buf: Buffer) =>
  buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export type OidcStateData = {
  redirectPath: string;
  codeVerifier: string;
  browserToken: string;
};

/**
 * Mints the `state`, the PKCE verifier, and the token that ties the flow to one
 * browser.
 *
 * State is stored server-side rather than signed into the URL so that consuming
 * it can delete it, which makes a callback single-use: a replayed callback
 * finds nothing and is rejected.
 *
 * `browserToken` exists because single-use alone does not stop login CSRF
 * (RFC 9700 §4.7.1): an attacker can start a login themselves and hand the
 * victim the resulting callback URL, logging the victim into the *attacker's*
 * account. It is returned to the caller to be set as a cookie, and the callback
 * refuses to proceed unless the cookie matches -- so a flow can only be
 * completed by the browser that began it.
 */
export const createOidcState = async (
  redirectPath: string,
): Promise<{ state: string; codeChallenge: string; browserToken: string }> => {
  const state = randomUUID();
  const codeVerifier = base64url(randomBytes(32));
  const browserToken = base64url(randomBytes(32));

  const data: OidcStateData = { redirectPath, codeVerifier, browserToken };

  await redis.set(
    `${STATE_PREFIX}${state}`,
    JSON.stringify(data),
    'EX',
    STATE_TTL_SECONDS,
  );

  return {
    state,
    codeChallenge: base64url(createHash('sha256').update(codeVerifier).digest()),
    browserToken,
  };
};

export const consumeOidcState = async (
  state: string,
): Promise<OidcStateData | null> => {
  if (!state) {
    return null;
  }

  const key = `${STATE_PREFIX}${state}`;
  const raw = await redis.get(key);

  // Delete before returning: a state must not survive its first use, even if
  // the rest of the callback then fails.
  await redis.del(key);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.codeVerifier || !parsed?.browserToken) {
      return null;
    }
    return {
      redirectPath: parsed.redirectPath || '/',
      codeVerifier: parsed.codeVerifier,
      browserToken: parsed.browserToken,
    };
  } catch {
    return null;
  }
};

/** Constant-time compare, so a mismatch cannot be found by timing. */
export const tokensMatch = (a?: string, b?: string): boolean => {
  if (!a || !b) {
    return false;
  }

  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * Only ever redirect within our own app. Anything absolute or protocol-relative
 * would turn the callback into an open redirect.
 */
export const safeRedirectPath = (value?: string): string => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
};

export const buildAuthorizationUrl = (
  config: OidcConfig,
  authorizationUrl: string,
  state: string,
  codeChallenge: string,
): string => {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes,
    state,
    // PKCE. Not required of a confidential client, but the OAuth security BCP
    // (RFC 9700) recommends it for every client type: it binds the code to this
    // request, so a code intercepted in transit cannot be redeemed elsewhere.
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${authorizationUrl}?${params.toString()}`;
};

/**
 * Exchanges the authorization code for tokens.
 *
 * This is a direct server-to-server call to the provider over TLS, authenticated
 * with the client secret, so the response arrived over a trusted channel and its
 * contents do not need their signature re-checked here. That is what keeps this
 * free of a JWKS/`openid-client` dependency.
 */
export const exchangeCodeForTokens = async (
  config: OidcConfig,
  code: string,
  codeVerifier: string,
): Promise<{ access_token: string; id_token?: string }> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString('base64');

  const response = await fetch(tokenEndpoint(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(
      `OIDC token exchange failed with ${response.status}: ${await response.text()}`,
    );
  }

  return response.json() as Promise<{ access_token: string; id_token?: string }>;
};

export const fetchUserInfo = async (
  config: OidcConfig,
  accessToken: string,
): Promise<OidcProfile> => {
  const response = await fetch(userInfoEndpoint(config), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `OIDC userinfo failed with ${response.status}: ${await response.text()}`,
    );
  }

  return response.json() as Promise<OidcProfile>;
};
