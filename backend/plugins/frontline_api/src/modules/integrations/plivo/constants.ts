/**
 * Plivo's REST base. The `/v1/` version prefix has been stable for the life of
 * the API and every account path is built from it.
 * https://www.plivo.com/docs/voice/api/overview
 */
export const PLIVO_API_BASE_URL = 'https://api.plivo.com/v1';

/**
 * Public path the Plivo webhooks are reachable on, below the API host.
 *
 * The gateway mounts every plugin under `/pl:<service>` and rewrites that prefix
 * away before proxying, so the plugin's own router sees a bare `/plivo/...` and
 * the request carries no trace of the prefix. Plivo, however, signs the URL it
 * was configured with — the one INCLUDING this prefix — so the public shape has
 * to be stated here rather than read back off the request.
 *
 * The colon is a literal path character and is deliberately NOT percent-encoded:
 * it is what Plivo has registered, and `%3A` would produce a different digest.
 */
export const PLIVO_CALLBACK_MOUNT_PATH = '/pl:frontline/plivo';

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
 *
 * These are the raw telephony `HangupCause` strings sent on the callback, not
 * the numeric `hangup_cause_code` of the CDR — the two are different vocabularies
 * and only the strings ever arrive here.
 * https://www.plivo.com/docs/voice/xml/overview#hangup-causes
 * https://www.plivo.com/docs/voice/troubleshooting/hangup-causes
 */
export const PLIVO_UNANSWERED_HANGUP_CAUSES = [
  'NO_ANSWER',
  'NO_USER_RESPONSE',
  'ORIGINATOR_CANCEL',
  'ALLOTTED_TIMEOUT',
] as const;

/** Hangup causes meaning the callee was on another call. */
export const PLIVO_BUSY_HANGUP_CAUSES = ['USER_BUSY'] as const;

/**
 * Hangup causes meaning the call could not be placed at all.
 *
 * `NETWORK_OUT_OF_ORDER` and `NO_ROUTE_DESTINATION` are carrier-side routing
 * failures, and `UNALLOCATED_NUMBER` is a number that does not exist; none of
 * them ever reached a ringing phone, so they are failures rather than misses.
 */
export const PLIVO_FAILED_HANGUP_CAUSES = [
  'CALL_REJECTED',
  'UNALLOCATED_NUMBER',
  'INVALID_NUMBER_FORMAT',
  'NO_ROUTE_DESTINATION',
  'NETWORK_OUT_OF_ORDER',
  'SERVICE_UNAVAILABLE',
  'DESTINATION_OUT_OF_ORDER',
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

/**
 * How long the logged-in agents' softphones ring, in seconds.
 *
 * Contact-centre practice is 15-20s per stage rather than one long ring: a
 * caller left listening to ringback with no way out abandons the call, and the
 * time is better spent moving on to the fallback number and then voicemail.
 */
export const PLIVO_DEFAULT_AGENT_RING_SECONDS = 20;

/** How long the fallback mobile rings once no agent has answered, in seconds. */
export const PLIVO_DEFAULT_FORWARD_RING_SECONDS = 20;

/**
 * Longest voicemail accepted, in seconds.
 *
 * Two minutes is the industry norm; Plivo's own `<Record>` default of 60s cuts
 * real messages short, and its ceiling is an hour, which would let a silent
 * line record indefinitely.
 * https://www.plivo.com/docs/voice/xml/record
 */
export const PLIVO_DEFAULT_VOICEMAIL_MAX_SECONDS = 120;

/**
 * Silence that ends a voicemail, in seconds.
 *
 * Matches Plivo's own `<Record timeout>` default. Without it a caller who hangs
 * up without pressing `#` leaves a recording padded with dead air.
 */
export const PLIVO_VOICEMAIL_SILENCE_TIMEOUT_SECONDS = 15;

/** Prompt read before the beep when the integration configures none. */
export const PLIVO_DEFAULT_VOICEMAIL_GREETING =
  'Sorry, nobody is available to take your call. ' +
  'Please leave a message after the beep, and press the pound key when you are finished.';

/** Played once the caller has left a message, before the line is released. */
export const PLIVO_VOICEMAIL_CLOSING_MESSAGE =
  'Thank you for your message. Goodbye.';

/**
 * How long Plivo stores a recording at no charge, in days.
 *
 * Storage is free for the first 90 days; after that Plivo keeps the recording
 * and bills for it rather than deleting it. The copy into erxes storage is
 * therefore about owning the file and avoiding an open-ended storage bill, not
 * about racing a deletion deadline.
 * https://www.plivo.com/docs/voice/api/recordings
 */
export const PLIVO_RECORDING_FREE_STORAGE_DAYS = 90;

/**
 * Domain every Plivo SIP endpoint registers under.
 *
 * An inbound call only rings a browser client when the application's answer_url
 * returns `<Dial><User>sip:USERNAME@phone.plivo.com</User></Dial>`, so this is
 * the host the endpoint URI handed to the frontend is built from.
 * https://www.plivo.com/docs/voice/concepts/sip-endpoint
 */
export const PLIVO_ENDPOINT_DOMAIN = 'phone.plivo.com';
