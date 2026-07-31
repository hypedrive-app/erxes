import { getSubdomain, isDev, normalizePhone } from 'erxes-api-shared/utils';
import { generateModels, IModels } from '~/connectionResolvers';
import { debugError, debugPlivo } from '@/integrations/plivo/debuggers';
import {
  buildCallbackUrl,
  escapeXml,
  validatePlivoSignature,
} from '@/integrations/plivo/utils';
import {
  PLIVO_DEFAULT_AGENT_RING_SECONDS,
  PLIVO_DEFAULT_FORWARD_RING_SECONDS,
  PLIVO_DEFAULT_VOICEMAIL_GREETING,
  PLIVO_DEFAULT_VOICEMAIL_MAX_SECONDS,
  PLIVO_ENDPOINT_DOMAIN,
  PLIVO_NONCE_HEADER,
  PLIVO_SIGNATURE_HEADER,
  PLIVO_SIGNATURE_MAIN_HEADER,
  PLIVO_VOICEMAIL_CLOSING_MESSAGE,
  PLIVO_VOICEMAIL_SILENCE_TIMEOUT_SECONDS,
} from '@/integrations/plivo/constants';
import { getReachableAgentEndpoints } from '@/integrations/plivo/helpers';
import {
  registerCallHangup,
  registerCallRecording,
  registerCallVoicemail,
  registerIncomingCall,
  registerOutgoingCall,
} from '@/integrations/plivo/controller/receiveCall';
import {
  IPlivoCallbackParams,
  IPlivoEndpointCredentialDocument,
  IPlivoIntegrationDocument,
} from '@/integrations/plivo/@types';

/**
 * Reads the callback parameters Plivo sent.
 *
 * The raw body is preferred because the V3 digest is built from the parameters
 * exactly as sent. A Plivo application can be configured to post JSON instead
 * of the default `application/x-www-form-urlencoded`, so both encodings are
 * accepted; `req.body` is the last resort for when a parser upstream already
 * consumed the stream and left nothing raw behind.
 *
 * Only scalar values are kept. Plivo repeats a key rather than sending arrays,
 * and `URLSearchParams` yields each repeat separately — the LAST wins, matching
 * how `express.urlencoded({ extended: false })` collapses the same input, so
 * the parsed view and the signed view cannot disagree.
 */
const parseCallbackParams = (req): IPlivoCallbackParams => {
  const params: IPlivoCallbackParams = {};

  const rawBody: Buffer | string | undefined = req.rawBody;
  const raw = rawBody === undefined ? '' : rawBody.toString();
  const trimmed = raw.trim();

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);

      for (const [key, value] of Object.entries(parsed)) {
        if (value !== null && typeof value !== 'object') {
          params[key] = String(value);
        }
      }

      return params;
    } catch {
      // Not the JSON it looked like; fall through to the form reading below.
    }
  }

  if (trimmed) {
    for (const [key, value] of new URLSearchParams(raw).entries()) {
      params[key] = value;
    }

    return params;
  }

  const body = req.body;

  if (body && typeof body === 'object') {
    for (const [key, value] of Object.entries(body)) {
      if (value !== null && value !== undefined && typeof value !== 'object') {
        params[key] = String(value);
      }
    }
  }

  return params;
};

/**
 * Every parameter as a plain string map, which is what the V3 digest is built
 * from. Kept separate from {@link IPlivoCallbackParams} so the signature code
 * never has to reason about optional fields.
 */
const toSignatureParams = (
  params: IPlivoCallbackParams,
): Record<string, string> => {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
};

const readHeader = (req, name: string): string | undefined => {
  const value = req.headers[name];

  return Array.isArray(value) ? value[0] : value;
};

/**
 * Verifies a callback really came from Plivo.
 *
 * Both signature headers are tried: Plivo signs with the sub-account token in
 * `X-Plivo-Signature-V3` and additionally with the main account token in
 * `X-Plivo-Signature-Ma-V3` when a sub-account placed the call. An integration
 * holding main-account credentials can only match the latter, so checking just
 * one header would reject legitimate traffic for half of all account setups.
 */
const isVerifiedCallback = (
  req,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  params: IPlivoCallbackParams,
): boolean => {
  const uri = buildCallbackUrl(req, subdomain);
  const nonce = readHeader(req, PLIVO_NONCE_HEADER);
  const signatureParams = toSignatureParams(params);

  const headers = [
    readHeader(req, PLIVO_SIGNATURE_HEADER),
    readHeader(req, PLIVO_SIGNATURE_MAIN_HEADER),
  ];

  return headers.some((signature) =>
    validatePlivoSignature(
      req.method,
      uri,
      nonce,
      integration.authToken,
      signature,
      signatureParams,
    ),
  );
};

/**
 * The SIP username out of a `sip:user@phone.plivo.com` URI, if that is what the
 * value is.
 *
 * A call placed from the browser softphone originates AT the endpoint, so Plivo
 * sends its SIP URI as `From` rather than a phone number — that URI is the only
 * thing on the callback identifying which integration and which agent the call
 * belongs to.
 *
 * The host is checked so a `From` that merely looks like a URI cannot be read
 * as one of our endpoints, and the username is compared case-insensitively
 * because SIP hosts are case-insensitive by RFC 3261.
 * https://www.plivo.com/docs/voice/concepts/sip-endpoint
 */
const readSipEndpointUsername = (value?: string): string => {
  if (!value) {
    return '';
  }

  const match = /^sips?:([^@]+)@(.+)$/i.exec(value.trim());

  if (!match) {
    return '';
  }

  const [, username, host] = match;

  // The host can carry a port or URI parameters (`;transport=tls`), neither of
  // which is part of the domain being matched.
  const domain = host.split(/[;:]/)[0].toLowerCase();

  return domain === PLIVO_ENDPOINT_DOMAIN ? username : '';
};

/**
 * Finds the endpoint credential row for a SIP username.
 *
 * The stored row is used rather than Plivo's endpoint list because it is the
 * only place the OWNING USER is recorded: the alias encodes an integration and
 * a user, but `buildPlivoEndpointAlias` strips every non-alphanumeric character
 * from both ids, so an alias cannot be split back into them unambiguously. The
 * row also answers in one indexed query rather than an HTTP round trip, which
 * matters here because a caller is holding the line while this runs.
 */
const findEndpointCredentialByUsername = async (
  models: IModels,
  username: string,
): Promise<IPlivoEndpointCredentialDocument | null> =>
  await models.PlivoEndpointCredentials.findOne({ username });

/** A verified callback, with the endpoint that placed it when there was one. */
interface IResolvedPlivoCallback {
  integration: IPlivoIntegrationDocument;
  /** Set only when the call originated at an agent's browser softphone. */
  credential: IPlivoEndpointCredentialDocument | null;
}

/**
 * Resolves the integration a callback belongs to, and rejects it unless the
 * signature checks out.
 *
 * The routing key is our own rented number, which is `To` on an inbound call
 * and `From` on an outbound one. It has to be matched before the signature can
 * be checked at all, because the auth token that keys the HMAC is stored on the
 * integration.
 *
 * A softphone-originated call carries neither: `From` is the agent's SIP URI and
 * `To` is the number being dialled, so it is resolved through the endpoint that
 * placed it instead. That lookup is tried second because the number match is
 * cheaper and covers every inbound call.
 *
 * A response has already been sent when this returns null; `onUnresolved`
 * decides what that response is, because a status callback acks with a bare 200
 * while the answer webhook must always reply with XML.
 *
 * The endpoint credential is returned with the integration when the call came
 * from a softphone: it is what makes the leg attributable to an agent, and
 * looking it up again downstream would repeat the same query.
 */
const resolveVerifiedIntegration = async (
  models: IModels,
  req,
  res,
  subdomain: string,
  params: IPlivoCallbackParams,
  onUnresolved: () => void,
): Promise<IResolvedPlivoCallback | null> => {
  // `plivoPhoneNumber` is stored normalised (`+919876543210`), but Plivo sends
  // `To`/`From` without the leading `+` on many callbacks. Matching only the
  // raw value would find nothing and silently drop every call, so both the raw
  // and the normalised form of each candidate are tried. No default country
  // code is available before the integration is known, so normalisation here
  // can only add the `+` that E.164 input already implies.
  const candidates = [...new Set(
    [params.To, params.From]
      .filter((value): value is string => Boolean(value))
      .flatMap((value) => [value, normalizePhone(value)])
      .filter(Boolean),
  )];

  const byNumber = candidates.length
    ? await models.PlivoIntegrations.findOne({
        plivoPhoneNumber: { $in: candidates },
      })
    : null;

  // Softphone-originated: neither party is our own number, so the endpoint in
  // `From` is what names the integration.
  const endpointUsername = byNumber
    ? ''
    : readSipEndpointUsername(params.From);

  const credential = endpointUsername
    ? await findEndpointCredentialByUsername(models, endpointUsername)
    : null;

  const integration =
    byNumber ||
    (credential
      ? await models.PlivoIntegrations.findOne({
          erxesApiId: credential.integrationId,
        })
      : null);

  if (!integration) {
    debugPlivo(
      `Callback for unknown Plivo number (from ${params.From} to ${params.To})`,
    );
    onUnresolved();
    return null;
  }

  if (!isVerifiedCallback(req, subdomain, integration, params)) {
    // Logged at error level rather than through a `debug` namespace: a rejected
    // callback silently kills a live call, and `debug` writes nothing unless the
    // DEBUG env var happens to enable this namespace — which is how this failure
    // stayed invisible in production. The reconstructed URI is included because a
    // mismatch against the registered answer_url is the usual cause.
    console.error(
      `[plivo] Rejected callback with invalid signature for ${
        integration.plivoPhoneNumber
      }; verified against ${buildCallbackUrl(req, subdomain)}`,
    );
    // Not a Plivo request at all, so there is no call waiting on XML — a bare
    // 403 is the right answer on every one of these webhooks.
    res.sendStatus(403);
    return null;
  }

  return { integration, credential };
};

/** Wraps PlivoXML elements in the `<Response>` document Plivo parses. */
const wrapResponseXml = (elements: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${elements.join(
    '\n  ',
  )}\n</Response>`;

/**
 * The only correct way to answer the answer webhook.
 *
 * `res.sendStatus(200)` sends the BODY `OK`, which is not XML — Plivo rejects it
 * with `Invalid Answer XML` and drops the call, reporting a misleading `Busy` to
 * the browser SDK. Every exit from this webhook goes through here so that
 * failure mode cannot come back.
 */
const sendAnswerXml = (res, xml: string) => {
  res.set('Content-Type', 'text/xml');

  return res.send(xml);
};

/**
 * The give-up answer, for a call we cannot attribute to any integration.
 *
 * Still well-formed XML with a real verb: the alternative is Plivo tearing the
 * call down as a malformed-XML error, which surfaces to the agent as a spurious
 * `Busy` and tells nobody what actually went wrong. The caller is told the line
 * is not available and then hung up on cleanly.
 *
 * `<Hangup>` carries no `reason`: the documented values are `rejected` and
 * `busy`, and neither is true here — nobody rejected the call and no line is
 * busy, we simply could not route it. A plain hangup after the announcement
 * ends the call normally instead of signalling a cause that would be read back
 * as the very `Busy` this bug used to masquerade as.
 * https://www.plivo.com/docs/voice/xml/hangup
 */
const buildUnroutableXml = (): string =>
  wrapResponseXml([
    '<Speak>Sorry, this number is not available right now. Goodbye.</Speak>',
    '<Hangup />',
  ]);

/**
 * What the answer route replies with when handling threw before any response
 * was written.
 *
 * Exported because the route's last-resort catch must answer in XML too — a
 * JSON error document is not PlivoXML and would drop the call exactly the way
 * the bare 200 did. Sent with a 200 deliberately: the status is not what Plivo
 * acts on here, the body is, and a 5xx would additionally make Plivo retry a
 * request that is failing deterministically.
 */
export const PLIVO_ANSWER_FAILURE_XML = wrapResponseXml([
  '<Speak>Sorry, we cannot take your call right now. Please try again later.</Speak>',
  '<Hangup />',
]);

/**
 * Answer webhook.
 *
 * Plivo fetches this URL when a call needs handling and plays back whatever
 * PlivoXML we return, so the response has to be XML with a `text/xml` content
 * type — a JSON body or a bare 200 makes Plivo hang up with
 * INVALID_ANSWER_XML.
 *
 * Unlike the other two callbacks the work is done BEFORE responding: the XML is
 * the response, so there is nothing to defer it behind.
 */
export const plivoAnswerWebhook = async (req, res, next) => {
  try {
    const subdomain = isDev ? 'localhost' : getSubdomain(req);
    const models = await generateModels(subdomain);

    const params = parseCallbackParams(req);

    const resolved = await resolveVerifiedIntegration(
      models,
      req,
      res,
      subdomain,
      params,
      // The call is live and waiting on XML. Anything else — including the bare
      // 200 Express sends as the body `OK` — is what Plivo reports as
      // "Invalid Answer XML" before dropping the call.
      () => sendAnswerXml(res, buildUnroutableXml()),
    );

    if (!resolved) {
      return;
    }

    const { integration, credential } = resolved;

    try {
      if (credential) {
        await registerOutgoingCall(
          models,
          subdomain,
          integration,
          credential.userId,
          params,
        );
      } else {
        await registerIncomingCall(models, subdomain, integration, params);
      }
    } catch (e: any) {
      // The caller is on the line right now: still answer them, and let the
      // hangup callback record the call even though the inbox missed it.
      debugError(
        `Failed to register Plivo call ${params.CallUUID}: ${e.message}`,
      );
    }

    return sendAnswerXml(
      res,
      await buildAnswerXml(
        req,
        subdomain,
        integration,
        params,
        Boolean(credential),
      ),
    );
  } catch (e) {
    next(e);
  }
};

/**
 * Swaps the `/answer` path of a callback URL for another webhook on the same
 * mount, e.g. `/recording` or `/voicemail`.
 *
 * The query string has to come off before `/answer` is swapped out: an anchored
 * replace would not match `/answer?x=1` and the callback would POST back to the
 * answer webhook, which re-registers the call and replies with XML the other
 * handlers never expect.
 */
const buildSiblingCallbackUrl = (
  req,
  subdomain: string,
  route: string,
): string => {
  const [path] = buildCallbackUrl(req, subdomain).split('?');

  return path.replace(/\/answer$/, route);
};

/**
 * The `<Dial>` stage that rings every reachable agent's browser at once.
 *
 * Plivo rings ALL children of a single `<Dial>` simultaneously and connects the
 * first to answer, so no queueing logic of our own is needed. `dialMusic="real"`
 * passes the real ringback through instead of hold music, so the caller hears a
 * ringing phone rather than being put on hold.
 * https://www.plivo.com/docs/voice/xml/dial
 */
const buildAgentDialElement = (
  integration: IPlivoIntegrationDocument,
  usernames: string[],
): string => {
  const legs = usernames
    .map(
      (username) =>
        `<User>sip:${escapeXml(username)}@${PLIVO_ENDPOINT_DOMAIN}</User>`,
    )
    .join('');

  return (
    `<Dial timeout="${
      integration.agentRingTimeout || PLIVO_DEFAULT_AGENT_RING_SECONDS
    }" callerId="${escapeXml(
      integration.plivoPhoneNumber.replace(/^\+/, ''),
    )}" dialMusic="real">${legs}</Dial>`
  );
};

/**
 * The voicemail stage: a prompt, the recording, then a closing line.
 *
 * Reached only when every `<Dial>` above it went unanswered, because a `<Dial>`
 * with no `action` URL falls through to the following elements rather than
 * ending the call. Hanging up here instead would silently discard the contact,
 * which is the behaviour this replaces.
 *
 * `redirect="false"` is deliberately NOT set: the default `redirect="true"` is
 * what makes Plivo continue with the XML this handler returns, and `timeout`
 * stops the recording after a stretch of silence so a caller who simply walks
 * away does not record two minutes of dead air.
 * https://www.plivo.com/docs/voice/xml/record
 */
const buildVoicemailElements = (
  req,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
): string[] => [
  `<Speak>${escapeXml(
    integration.voicemailGreeting || PLIVO_DEFAULT_VOICEMAIL_GREETING,
  )}</Speak>`,
  `<Record action="${escapeXml(
    buildSiblingCallbackUrl(req, subdomain, '/voicemail'),
  )}" method="POST" maxLength="${
    integration.voicemailMaxLength || PLIVO_DEFAULT_VOICEMAIL_MAX_SECONDS
  }" timeout="${PLIVO_VOICEMAIL_SILENCE_TIMEOUT_SECONDS}" playBeep="true" finishOnKey="#" />`,
  `<Speak>${escapeXml(PLIVO_VOICEMAIL_CLOSING_MESSAGE)}</Speak>`,
];

/**
 * Builds the PlivoXML that answers a call.
 *
 * An inbound call is routed in stages, each falling through to the next only
 * when nobody answered: the browser softphones of agents who are actually
 * registered, then the configured fallback handset, then voicemail. This is the
 * contact-centre norm — the caller is never simply hung up on, because an
 * unanswered call that leaves no trace is a lost contact.
 *
 * A softphone-originated call is the mirror image and has no stages at all: the
 * agent is already on the line, so the single job is to bridge them out to the
 * number they dialled.
 *
 * `<Record recordSession>` is emitted only when the integration opts in,
 * because recording consent is jurisdiction-specific and Plivo starts recording
 * the instant the element is parsed. `redirect="false"` keeps the call going
 * after recording starts rather than jumping to the callback.
 * https://www.plivo.com/docs/voice/xml/record
 */
const buildAnswerXml = async (
  req,
  subdomain: string,
  integration: IPlivoIntegrationDocument,
  params: IPlivoCallbackParams,
  isFromSoftphone: boolean,
): Promise<string> => {
  // Plivo labels a softphone-originated leg `inbound` — it is inbound to the
  // platform — so `Direction` cannot be trusted to spot one. Having resolved
  // the integration through the endpoint that placed it is the reliable signal.
  const direction =
    isFromSoftphone || params.Direction === 'outbound' ? 'outbound' : 'inbound';

  const elements: string[] = [];

  if (integration.recordCalls) {
    elements.push(
      `<Record action="${escapeXml(
        buildSiblingCallbackUrl(req, subdomain, '/recording'),
      )}" method="POST" redirect="false" maxLength="3600" recordSession="true" />`,
    );
  }

  if (direction === 'inbound') {
    // `ringAgents` unset means ON: an integration stored before agent ringing
    // existed should still reach the agents who are logged in.
    const agentUsernames =
      integration.ringAgents === false
        ? []
        : await getReachableAgentEndpoints({
            authId: integration.authId,
            authToken: integration.authToken,
            integrationId: integration.erxesApiId,
          });

    if (agentUsernames.length) {
      elements.push(buildAgentDialElement(integration, agentUsernames));
    }

    const fallbackNumber = normalizePhone(
      integration.forwardToNumber,
      integration.defaultCountryCode,
    );

    if (fallbackNumber) {
      // Bridge the caller to the fallback handset. `callerId` stays the Plivo
      // number rather than the caller's: an Indian mobile will not display an
      // arbitrary spoofed CLI, and Plivo rejects a callerId the account does
      // not own, which would fail the whole call.
      elements.push(
        `<Dial timeout="${
          integration.forwardTimeout || PLIVO_DEFAULT_FORWARD_RING_SECONDS
        }" callerId="${escapeXml(
          integration.plivoPhoneNumber.replace(/^\+/, ''),
        )}" dialMusic="real">` +
          `<Number>${escapeXml(fallbackNumber.replace(/^\+/, ''))}</Number>` +
          `</Dial>`,
      );
    }

    const canReachSomeone = Boolean(agentUsernames.length || fallbackNumber);

    if (integration.voicemailEnabled === false) {
      // Voicemail explicitly turned off. The caller is still told what happened
      // rather than left listening to silence until the carrier drops the line.
      elements.push(
        canReachSomeone
          ? '<Speak>Sorry, nobody is available right now. Please try again later.</Speak>'
          : '<Speak>Please hold while we connect you to an agent.</Speak>',
      );
    } else if (canReachSomeone) {
      elements.push(...buildVoicemailElements(req, subdomain, integration));
    } else {
      // Nothing at all is configured and no agent is online. Announce-only is
      // kept rather than failing the call, but the caller is still offered a
      // voicemail so the contact is not lost.
      elements.push(
        '<Speak>Please hold while we connect you to an agent.</Speak>',
        ...buildVoicemailElements(req, subdomain, integration),
      );
    }
  } else if (isFromSoftphone) {
    // The agent's browser is the leg that is already up; `To` is the PSTN
    // number they dialled. Bridging it is the entire job — a `<Response>` with
    // no verb, or the bare `OK` this used to send, makes Plivo drop the call
    // immediately with `Invalid Answer XML`.
    const destination = normalizePhone(
      params.To,
      integration.defaultCountryCode,
    );

    if (destination) {
      // `callerId` must be the Plivo number: the SIP endpoint's URI is not a
      // number the account owns, and Plivo rejects a callerId it cannot verify,
      // which fails the whole call rather than just hiding the CLI.
      elements.push(
        `<Dial timeout="${
          integration.forwardTimeout || PLIVO_DEFAULT_FORWARD_RING_SECONDS
        }" callerId="${escapeXml(
          integration.plivoPhoneNumber.replace(/^\+/, ''),
        )}" dialMusic="real">` +
          `<Number>${escapeXml(destination.replace(/^\+/, ''))}</Number>` +
          `</Dial>`,
      );
    } else {
      // The dialled number was unusable. The agent hears why instead of the
      // call dying on them with no explanation.
      elements.push(
        '<Speak>Sorry, that number could not be dialled. Goodbye.</Speak>',
        '<Hangup />',
      );
    }
  } else {
    // A call Plivo itself reports as outbound: the answer XML drives the leg
    // that was just picked up, and a `<Response>` carrying no verb would make
    // Plivo hang up instantly. `<Speak>` keeps the leg up until it is bridged.
    elements.push('<Speak>Connecting you now.</Speak>');
  }

  return wrapResponseXml(elements);
};

/**
 * Hangup / status callback.
 *
 * Plivo retries on any non-2xx or slow reply, so the callback is acknowledged
 * first and processed after: a failure while recording one call must not make
 * Plivo redeliver it. A rejected signature still returns 403 — that request is
 * not from Plivo.
 */
export const plivoHangupWebhook = async (req, res, next) => {
  try {
    const subdomain = isDev ? 'localhost' : getSubdomain(req);
    const models = await generateModels(subdomain);

    const params = parseCallbackParams(req);

    const resolved = await resolveVerifiedIntegration(
      models,
      req,
      res,
      subdomain,
      params,
      // A status callback, not a call waiting on XML: a bare 200 is exactly the
      // right ack and stops Plivo retrying something we cannot place.
      () => res.sendStatus(200),
    );

    if (!resolved) {
      return;
    }

    const { integration } = resolved;

    res.sendStatus(200);

    try {
      await registerCallHangup(models, subdomain, params);
    } catch (e: any) {
      debugError(
        `Failed to process Plivo hangup for ${params.CallUUID}: ${e.message}`,
      );
    }
  } catch (e) {
    next(e);
  }
};

/**
 * Voicemail callback, fired by the `<Record>` the inbound flow falls through to.
 *
 * Separate from the recording callback on purpose: a recording is metadata on a
 * call that was answered, whereas a voicemail is an unhandled contact that still
 * needs an agent to act on it, and the two must not land as the same kind of
 * row. Acknowledged before processing for the same reason as the others.
 */
export const plivoVoicemailWebhook = async (req, res, next) => {
  try {
    const subdomain = isDev ? 'localhost' : getSubdomain(req);
    const models = await generateModels(subdomain);

    const params = parseCallbackParams(req);

    const resolved = await resolveVerifiedIntegration(
      models,
      req,
      res,
      subdomain,
      params,
      // A status callback, not a call waiting on XML: a bare 200 is exactly the
      // right ack and stops Plivo retrying something we cannot place.
      () => res.sendStatus(200),
    );

    if (!resolved) {
      return;
    }

    const { integration } = resolved;

    res.sendStatus(200);

    try {
      await registerCallVoicemail(models, subdomain, integration, params);
    } catch (e: any) {
      debugError(
        `Failed to store Plivo voicemail for ${params.CallUUID}: ${e.message}`,
      );
    }
  } catch (e) {
    next(e);
  }
};

/**
 * Recording callback. Acknowledged before processing for the same reason as the
 * hangup callback — which also keeps Plivo from redelivering it while the
 * recording is being downloaded and copied into erxes storage.
 */
export const plivoRecordingWebhook = async (req, res, next) => {
  try {
    const subdomain = isDev ? 'localhost' : getSubdomain(req);
    const models = await generateModels(subdomain);

    const params = parseCallbackParams(req);

    const resolved = await resolveVerifiedIntegration(
      models,
      req,
      res,
      subdomain,
      params,
      // A status callback, not a call waiting on XML: a bare 200 is exactly the
      // right ack and stops Plivo retrying something we cannot place.
      () => res.sendStatus(200),
    );

    if (!resolved) {
      return;
    }

    const { integration } = resolved;

    res.sendStatus(200);

    try {
      await registerCallRecording(models, subdomain, integration, params);
    } catch (e: any) {
      debugError(
        `Failed to store Plivo recording for ${params.CallUUID}: ${e.message}`,
      );
    }
  } catch (e) {
    next(e);
  }
};
