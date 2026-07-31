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
} from '@/integrations/plivo/controller/receiveCall';
import {
  IPlivoCallbackParams,
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
  integration: IPlivoIntegrationDocument,
  params: IPlivoCallbackParams,
): boolean => {
  const uri = buildCallbackUrl(req);
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
 * Resolves the integration a callback belongs to, and rejects it unless the
 * signature checks out.
 *
 * The routing key is our own rented number, which is `To` on an inbound call
 * and `From` on an outbound one. It has to be matched before the signature can
 * be checked at all, because the auth token that keys the HMAC is stored on the
 * integration.
 *
 * A response has already been sent when this returns null.
 */
const resolveVerifiedIntegration = async (
  models: IModels,
  req,
  res,
  params: IPlivoCallbackParams,
): Promise<IPlivoIntegrationDocument | null> => {
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

  if (!candidates.length) {
    // Nothing addressable; ack so Plivo stops retrying.
    res.sendStatus(200);
    return null;
  }

  const integration = await models.PlivoIntegrations.findOne({
    plivoPhoneNumber: { $in: candidates },
  });

  if (!integration) {
    debugPlivo(
      `Callback for unknown Plivo number (from ${params.From} to ${params.To})`,
    );
    res.sendStatus(200);
    return null;
  }

  if (!isVerifiedCallback(req, integration, params)) {
    debugError(
      `Rejected Plivo callback with invalid signature for ${integration.plivoPhoneNumber}`,
    );
    res.sendStatus(403);
    return null;
  }

  return integration;
};

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

    const integration = await resolveVerifiedIntegration(
      models,
      req,
      res,
      params,
    );

    if (!integration) {
      return;
    }

    try {
      await registerIncomingCall(models, subdomain, integration, params);
    } catch (e: any) {
      // The caller is on the line right now: still answer them, and let the
      // hangup callback record the call even though the inbox missed it.
      debugError(
        `Failed to register Plivo call ${params.CallUUID}: ${e.message}`,
      );
    }

    res.set('Content-Type', 'text/xml');

    return res.send(await buildAnswerXml(req, integration, params));
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
const buildSiblingCallbackUrl = (req, route: string): string => {
  const [path] = buildCallbackUrl(req).split('?');

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
  integration: IPlivoIntegrationDocument,
): string[] => [
  `<Speak>${escapeXml(
    integration.voicemailGreeting || PLIVO_DEFAULT_VOICEMAIL_GREETING,
  )}</Speak>`,
  `<Record action="${escapeXml(
    buildSiblingCallbackUrl(req, '/voicemail'),
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
 * `<Record recordSession>` is emitted only when the integration opts in,
 * because recording consent is jurisdiction-specific and Plivo starts recording
 * the instant the element is parsed. `redirect="false"` keeps the call going
 * after recording starts rather than jumping to the callback.
 * https://www.plivo.com/docs/voice/xml/record
 */
const buildAnswerXml = async (
  req,
  integration: IPlivoIntegrationDocument,
  params: IPlivoCallbackParams,
): Promise<string> => {
  const direction = params.Direction === 'outbound' ? 'outbound' : 'inbound';

  const elements: string[] = [];

  if (integration.recordCalls) {
    elements.push(
      `<Record action="${escapeXml(
        buildSiblingCallbackUrl(req, '/recording'),
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
      elements.push(...buildVoicemailElements(req, integration));
    } else {
      // Nothing at all is configured and no agent is online. Announce-only is
      // kept rather than failing the call, but the caller is still offered a
      // voicemail so the contact is not lost.
      elements.push(
        '<Speak>Please hold while we connect you to an agent.</Speak>',
        ...buildVoicemailElements(req, integration),
      );
    }
  } else {
    // An outbound call's answer XML drives the leg that was just picked up. A
    // `<Response>` carrying no verb makes Plivo hang up immediately, so the
    // callee would never hear anything and every outbound call would drop the
    // instant it connected. `<Speak>` keeps the leg up until the agent leg is
    // bridged.
    elements.push('<Speak>Connecting you now.</Speak>');
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  ${elements.join(
    '\n  ',
  )}\n</Response>`;
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

    const integration = await resolveVerifiedIntegration(
      models,
      req,
      res,
      params,
    );

    if (!integration) {
      return;
    }

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

    const integration = await resolveVerifiedIntegration(
      models,
      req,
      res,
      params,
    );

    if (!integration) {
      return;
    }

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

    const integration = await resolveVerifiedIntegration(
      models,
      req,
      res,
      params,
    );

    if (!integration) {
      return;
    }

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
