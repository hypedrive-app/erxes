import * as crypto from 'crypto';
import {
  ERROR_CODE_OUTSIDE_SERVICE_WINDOW,
  GRAPH_API_URL,
} from '@/integrations/whatsapp/constants';
import {
  debugError,
  debugExternalRequests,
} from '@/integrations/whatsapp/debuggers';

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

  return response?.messages?.[0]?.id || '';
};

/**
 * Resolves a media id to a temporary download URL.
 *
 * Meta expires these URLs after five minutes and they must be fetched with the
 * same bearer token, so the result is deliberately not cached anywhere.
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
