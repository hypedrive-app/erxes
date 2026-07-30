/**
 * Plivo's REST base. The `/v1/` version prefix has been stable for the life of
 * the API and every account path is built from it.
 * https://www.plivo.com/docs/voice/api/overview
 */
export const PLIVO_API_BASE_URL = 'https://api.plivo.com/v1';

/**
 * Header carrying the V3 signature for a sub-account request.
 * https://www.plivo.com/docs/voice/concepts/signature-validation
 */
export const PLIVO_SIGNATURE_HEADER = 'x-plivo-signature-v3';

/**
 * Header carrying the V3 signature computed with the MAIN account's auth token.
 * Plivo sends it in addition to the sub-account signature when a sub-account
 * makes the call, so an integration configured with main-account credentials
 * has to check this one instead.
 */
export const PLIVO_SIGNATURE_MAIN_HEADER = 'x-plivo-signature-ma-v3';

/** Random per-request value mixed into the V3 digest. */
export const PLIVO_NONCE_HEADER = 'x-plivo-signature-v3-nonce';

/**
 * Hangup causes that mean the call was never actually answered.
 *
 * Plivo sets `CallStatus` to `completed` for every call that ends, answered or
 * not, so the cause is the only way to tell a real conversation from a missed
 * one — which is what decides whether the inbox shows it as a missed call.
 * https://www.plivo.com/docs/voice/api/call#hangup-causes
 */
export const PLIVO_UNANSWERED_HANGUP_CAUSES = [
  'NO_ANSWER',
  'ORIGINATOR_CANCEL',
  'TIMEOUT',
  'CANCEL',
] as const;

/** Hangup causes meaning the callee was on another call. */
export const PLIVO_BUSY_HANGUP_CAUSES = ['BUSY', 'USER_BUSY'] as const;

/** Hangup causes meaning the call could not be placed at all. */
export const PLIVO_FAILED_HANGUP_CAUSES = [
  'REJECTED',
  'INVALID_NUMBER',
  'UNALLOCATED_NUMBER',
  'INVALID_ANSWER_XML',
  'NORMAL_TEMPORARY_FAILURE',
] as const;

/**
 * Maximum call length in seconds handed to Plivo as `time_limit`.
 *
 * Plivo's own default is 14400s (4 hours); this shorter ceiling stops a call
 * left off the hook from billing for hours.
 * https://www.plivo.com/docs/voice/api/call#create-an-outbound-call
 */
export const PLIVO_DEFAULT_TIME_LIMIT_SECONDS = 3600;

/**
 * How long Plivo rings the destination before giving up, in seconds.
 * https://www.plivo.com/docs/voice/api/call#create-an-outbound-call
 */
export const PLIVO_DEFAULT_RING_TIMEOUT_SECONDS = 45;

/** Plivo deletes recordings this many days after they are created. */
export const PLIVO_RECORDING_RETENTION_DAYS = 90;
