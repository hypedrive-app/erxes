import * as crypto from 'crypto';
import {
  ERROR_CODE_INVALID_TOKEN,
  ERROR_CODE_OUTSIDE_SERVICE_WINDOW,
  GRAPH_API_URL,
  RETRYABLE_ERROR_CODES,
} from '@/integrations/whatsapp/constants';
import {
  debugError,
  debugExternalRequests,
} from '@/integrations/whatsapp/debuggers';
import {
  IWhatsappTemplate,
  IWhatsappTemplateSendComponent,
} from '@/integrations/whatsapp/@types';

/**
 * A failed Cloud API call, carrying Meta's own error code so callers can react
 * to specific conditions (notably the 24 hour window) instead of matching on
 * message text.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export class WhatsappApiError extends Error {
  public readonly status: number;
  public readonly code?: number;

  constructor(status: number, message: string, code?: number) {
    super(message);
    this.name = 'WhatsappApiError';
    this.status = status;
    this.code = code;
  }

  /**
   * True when Meta refused the send because more than 24 hours have passed
   * since the customer's last message. The reply is not retryable as-is — it
   * has to go out as a pre-approved template instead.
   */
  public get isOutsideServiceWindow(): boolean {
    return this.code === ERROR_CODE_OUTSIDE_SERVICE_WINDOW;
  }

  /**
   * True when the request was fine and only rate limiting rejected it, so the
   * same payload can be sent again after a backoff. Anything else is permanent
   * for the request as written and retrying it unchanged only burns quota.
   */
  public get isRetryable(): boolean {
    return RETRYABLE_ERROR_CODES.includes(this.code ?? -1);
  }

  /** The token expired or was revoked; the integration must be reconnected. */
  public get isAuthError(): boolean {
    return this.code === ERROR_CODE_INVALID_TOKEN;
  }
}

interface IGraphRequestArgs {
  accessToken: string;
  method: 'GET' | 'POST';
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
 * Single entry point for Graph API calls.
 *
 * Errors are surfaced as {@link WhatsappApiError} so the caller keeps Meta's
 * numeric code; the access token is never logged.
 */
export const graphRequest = async <T = any>({
  accessToken,
  method,
  path,
  body,
}: IGraphRequestArgs): Promise<T> => {
  const url = path.startsWith('http') ? path : `${GRAPH_API_URL}${path}`;

  debugExternalRequests(`WhatsApp ${method} ${url}`);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = parseResponseBody(await response.text());

  if (!response.ok) {
    const error = data?.error || {};

    throw new WhatsappApiError(
      response.status,
      `WhatsApp API error ${response.status}: ${
        error.message || response.statusText
      }`,
      error.code,
    );
  }

  return data as T;
};

/**
 * Verifies the `X-Hub-Signature-256` header Meta sends with every webhook.
 *
 * The digest is taken over the RAW request body — re-serialising the parsed
 * JSON produces different bytes and will not match, so the caller must capture
 * the raw buffer (see the `verify` hook on express.json in routes.ts).
 *
 * Returns false rather than throwing so the caller decides the response code,
 * and uses a constant-time comparison so a mismatch cannot be probed by timing.
 *
 * @param rawBody - the unparsed request body
 * @param signatureHeader - value of the `X-Hub-Signature-256` header
 * @param appSecret - the Meta app secret
 */
export const verifyWebhookSignature = (
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string | undefined,
): boolean => {
  if (!appSecret) {
    // Nothing to verify against. Treated as a failure by callers that require
    // a signature, so a misconfigured integration cannot silently accept
    // unauthenticated webhooks.
    return false;
  }

  if (!rawBody || !signatureHeader?.startsWith('sha256=')) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const received = signatureHeader.slice('sha256='.length);

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');

  // timingSafeEqual throws when lengths differ, which itself leaks length —
  // check first, then compare in constant time.
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

/**
 * Sends a plain text message.
 *
 * @param to - recipient in E.164 WITHOUT a leading `+`, as Meta expects
 * @param replyToMid - optional wamid to quote
 * @returns the wamid Meta assigned to the sent message
 */
export const sendWhatsappText = async ({
  accessToken,
  phoneNumberId,
  to,
  text,
  replyToMid,
}: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  text: string;
  replyToMid?: string;
}): Promise<string> => {
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  };

  if (replyToMid) {
    body.context = { message_id: replyToMid };
  }

  const response = await graphRequest<{ messages?: Array<{ id: string }> }>({
    accessToken,
    method: 'POST',
    path: `/${phoneNumberId}/messages`,
    body,
  });

  const mid = response?.messages?.[0]?.id;

  // `mid` is uniquely indexed, so an empty string here would be stored once and
  // then collide with every later send that also failed to get an id, silently
  // returning an unrelated message row. A send we cannot identify is a failure.
  if (!mid) {
    throw new WhatsappApiError(
      200,
      'WhatsApp accepted the message but returned no message id',
    );
  }

  return mid;
};

/**
 * Lists the APPROVED message templates on a WhatsApp Business Account.
 *
 * Only approved templates can actually be sent, so the filter is applied at the
 * API rather than locally — a PENDING or REJECTED template offered to an agent
 * would only fail at send time.
 *
 * @param whatsappBusinessAccountId - the WABA id, not the phone number id
 * https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
 */
export const listWhatsappTemplates = async ({
  accessToken,
  whatsappBusinessAccountId,
  limit = 200,
}: {
  accessToken: string;
  whatsappBusinessAccountId: string;
  limit?: number;
}): Promise<IWhatsappTemplate[]> => {
  const response = await graphRequest<{ data?: IWhatsappTemplate[] }>({
    accessToken,
    method: 'GET',
    path: `/${whatsappBusinessAccountId}/message_templates?status=APPROVED&limit=${limit}`,
  });

  return response?.data || [];
};

/**
 * Sends a pre-approved template message.
 *
 * This is the only thing Meta accepts outside the 24 hour customer service
 * window, so unlike {@link sendWhatsappText} the caller must NOT gate it on
 * that window.
 *
 * `components` is forwarded as given: positional `{{1}}`, `{{2}}` placeholders
 * are resolved by ARRAY ORDER within each component's `parameters[]`, so the
 * caller owns that ordering. A count or type mismatch against the approved
 * template is rejected by Meta (the 132000/132001 error family) rather than
 * silently rendering a blank.
 *
 * @param to - recipient in E.164 WITHOUT a leading `+`, as Meta expects
 * @param languageCode - must match the approved template's language, e.g. `en_US`
 * @returns the wamid Meta assigned to the sent message
 */
export const sendWhatsappTemplate = async ({
  accessToken,
  phoneNumberId,
  to,
  name,
  languageCode,
  components,
}: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  name: string;
  languageCode: string;
  components?: IWhatsappTemplateSendComponent[];
}): Promise<string> => {
  const template: Record<string, unknown> = {
    name,
    language: { code: languageCode },
  };

  // Meta rejects an empty `components` array on a template that takes no
  // parameters, so the key is omitted entirely rather than sent as [].
  if (components?.length) {
    template.components = components;
  }

  const response = await graphRequest<{ messages?: Array<{ id: string }> }>({
    accessToken,
    method: 'POST',
    path: `/${phoneNumberId}/messages`,
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template,
    },
  });

  const mid = response?.messages?.[0]?.id;

  // Same reasoning as sendWhatsappText: `mid` is uniquely indexed and a send we
  // cannot identify is a failure, not a success with a blank id.
  if (!mid) {
    throw new WhatsappApiError(
      200,
      'WhatsApp accepted the template but returned no message id',
    );
  }

  return mid;
};

/**
 * Marks an inbound message as read, optionally showing a typing indicator.
 *
 * Both are the same call: the indicator rides along with the read receipt.
 * Meta clears it once our reply is sent or after 25 seconds, whichever comes
 * first, so it is only worth setting when a reply is actually imminent.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators/
 */
export const markWhatsappMessageRead = async ({
  accessToken,
  phoneNumberId,
  messageId,
  showTyping,
}: {
  accessToken: string;
  phoneNumberId: string;
  messageId: string;
  showTyping?: boolean;
}): Promise<void> => {
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };

  if (showTyping) {
    body.typing_indicator = { type: 'text' };
  }

  try {
    await graphRequest({
      accessToken,
      method: 'POST',
      path: `/${phoneNumberId}/messages`,
      body,
    });
  } catch (e: any) {
    // A read receipt is cosmetic; never fail the surrounding work over it.
    debugError(`Failed to mark WhatsApp message ${messageId} read: ${e.message}`);
  }
};

/**
 * Resolves a media id to a temporary download URL.
 *
 * The URL itself is short-lived and must be fetched with the same bearer
 * token, so the result is deliberately not cached. Note the id from an inbound
 * webhook is only downloadable for 7 days (shorter than the 30 days that
 * applies to media we upload ourselves), so inbound media has to be fetched
 * promptly rather than lazily on first view.
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/media/media-download-api
 */
export const getWhatsappMediaUrl = async ({
  accessToken,
  mediaId,
}: {
  accessToken: string;
  mediaId: string;
}): Promise<string> => {
  try {
    const response = await graphRequest<{ url?: string }>({
      accessToken,
      method: 'GET',
      path: `/${mediaId}`,
    });

    return response?.url || '';
  } catch (e: any) {
    debugError(`Failed to resolve WhatsApp media ${mediaId}: ${e.message}`);
    return '';
  }
};
