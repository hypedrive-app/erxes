/**
 * Graph API version used for every Cloud API call.
 *
 * Meta keeps each version usable for about two years, so this is pinned rather
 * than floating: an unannounced bump can change payload shapes underneath us.
 * https://developers.facebook.com/docs/graph-api/changelog
 */
export const GRAPH_API_VERSION = 'v26.0';

export const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Meta rejects a free-form message when more than 24 hours have passed since
 * the customer last wrote to us (error 131047) — only a pre-approved template
 * may be sent after that. Kept here so the API layer and the UI agree on when
 * to warn an agent.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Cloud API error code for "outside the 24 hour customer service window". */
export const ERROR_CODE_OUTSIDE_SERVICE_WINDOW = 131047;

/**
 * Errors worth retrying after a backoff — the request was well formed and only
 * failed because we were going too fast.
 *
 * 130429: app-level throughput exceeded.
 * 131056: too many messages to this same recipient.
 *
 * Everything else (131026 undeliverable, 131051 unsupported type, 100 bad
 * request, 190 expired token) is permanent for the request as sent: retrying
 * it unchanged just burns quota, so those must surface to the agent or trigger
 * re-auth instead.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export const RETRYABLE_ERROR_CODES = [130429, 131056];

/** Access token expired or revoked; the integration needs reconnecting. */
export const ERROR_CODE_INVALID_TOKEN = 190;

/** Webhook `field` we subscribe to; anything else is ignored. */
export const WEBHOOK_FIELD_MESSAGES = 'messages';

/** Message types this module renders as a plain attachment. */
export const MEDIA_MESSAGE_TYPES = [
  'image',
  'video',
  'audio',
  'document',
  'sticker',
] as const;
