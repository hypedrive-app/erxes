import { getSubdomain, isDev } from 'erxes-api-shared/utils';
import { generateModels, IModels } from '~/connectionResolvers';
import { debugError, debugPlivo } from '@/integrations/plivo/debuggers';
import {
  buildCallbackUrl,
  escapeXml,
  validatePlivoSignature,
} from '@/integrations/plivo/utils';
import {
  PLIVO_NONCE_HEADER,
  PLIVO_SIGNATURE_HEADER,
  PLIVO_SIGNATURE_MAIN_HEADER,
} from '@/integrations/plivo/constants';
import {
  registerCallHangup,
  registerCallRecording,
  registerIncomingCall,
} from '@/integrations/plivo/controller/receiveCall';
import {
  IPlivoCallbackParams,
  IPlivoIntegrationDocument,
} from '@/integrations/plivo/@types';

/**
 * Plivo posts callbacks as `application/x-www-form-urlencoded`, and the plugin
 * host only installs a JSON body parser — so `req.body` is empty for these
 * requests and the parameters have to be read out of the raw body.
 *
 * That is also the correct source for signature validation: the digest covers
 * the parameters exactly as sent, and re-serialising a parsed object can change
 * them.
 */
const parseCallbackParams = (
  rawBody: Buffer | string | undefined,
): IPlivoCallbackParams => {
  if (!rawBody) {
    return {};
  }

  const params: IPlivoCallbackParams = {};

  const search = new URLSearchParams(rawBody.toString());

  for (const [key, value] of search.entries()) {
    params[key] = value;
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
  const candidates = [params.To, params.From].filter(Boolean);

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

    const params = parseCallbackParams(req.rawBody);

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

    return res.send(buildAnswerXml(req, integration, params));
  } catch (e) {
    next(e);
  }
};

/**
 * Builds the PlivoXML that answers a call.
 *
 * `<Record>` is emitted only when the integration opts in, because recording
 * consent is jurisdiction-specific and Plivo starts recording the instant the
 * element is parsed. `redirect="false"` keeps the call going after recording
 * starts rather than jumping to the callback.
 * https://www.plivo.com/docs/voice/xml/record
 */
const buildAnswerXml = (
  req,
  integration: IPlivoIntegrationDocument,
  params: IPlivoCallbackParams,
): string => {
  const direction = params.Direction === 'outbound' ? 'outbound' : 'inbound';

  const elements: string[] = [];

  if (integration.recordCalls) {
    const callbackUrl = buildCallbackUrl(req).replace(/\/answer$/, '/recording');

    elements.push(
      `<Record action="${escapeXml(
        callbackUrl,
      )}" method="POST" redirect="false" maxLength="3600" recordSession="true" />`,
    );
  }

  if (direction === 'inbound') {
    // No agent leg is bridged from here yet, so the caller is told what is
    // happening rather than left listening to silence.
    elements.push(
      '<Speak>Please hold while we connect you to an agent.</Speak>',
    );
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

    const params = parseCallbackParams(req.rawBody);

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
 * Recording callback. Acknowledged before processing for the same reason as the
 * hangup callback.
 */
export const plivoRecordingWebhook = async (req, res, next) => {
  try {
    const subdomain = isDev ? 'localhost' : getSubdomain(req);
    const models = await generateModels(subdomain);

    const params = parseCallbackParams(req.rawBody);

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
      await registerCallRecording(models, params);
    } catch (e: any) {
      debugError(
        `Failed to store Plivo recording for ${params.CallUUID}: ${e.message}`,
      );
    }
  } catch (e) {
    next(e);
  }
};
