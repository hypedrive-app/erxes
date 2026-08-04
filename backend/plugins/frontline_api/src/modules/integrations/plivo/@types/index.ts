import { Document } from 'mongoose';

export interface IPlivoIntegration {
  kind: string;
  erxesApiId: string;
  authId: string;
  authToken: string;
  plivoPhoneNumber: string;
  appId?: string;
  defaultCountryCode?: string;
  recordCalls?: boolean;
  /** E.164 number an inbound call is bridged to; empty means announce only. */
  forwardToNumber?: string;
  /** Seconds to ring the agent before giving up. */
  forwardTimeout?: number;
  /**
   * Ring the browser softphones of logged-in agents before the fallback number.
   * Defaults to on; set false to keep the old forward-only routing.
   */
  ringAgents?: boolean;
  /** Seconds to ring the agents' softphones before falling back. */
  agentRingTimeout?: number;
  /** Take a voicemail when nobody answered. Defaults to on. */
  voicemailEnabled?: boolean;
  /** Seconds of voicemail to accept before stopping the recording. */
  voicemailMaxLength?: number;
  /** Prompt read to the caller before the beep. */
  voicemailGreeting?: string;
  healthStatus?: string;
  error?: string;
}

export interface IPlivoIntegrationDocument extends IPlivoIntegration, Document {
  _id: string;
}

/**
 * One agent's SIP endpoint on one integration, with the password it registers
 * with.
 *
 * Stored because Plivo will not give a password back: the browser authenticates
 * with `client.login(username, password)`, so the value POSTed at provisioning
 * time is the only copy that exists. See `ensurePlivoEndpoint`.
 */
export interface IPlivoEndpointCredential {
  /** Inbox integration id the endpoint belongs to. */
  integrationId: string;
  /** Erxes user the endpoint was provisioned for. */
  userId: string;
  /** Plivo's own endpoint id, used to rotate the password. */
  endpointId: string;
  /** The username Plivo assigned, which is what actually registers. */
  username: string;
  /** Alias we set at creation; the only field that identifies our endpoints. */
  alias: string;
  /** Live SIP credential. Never logged, never returned to another user. */
  password: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlivoEndpointCredentialDocument
  extends IPlivoEndpointCredential,
    Document {
  _id: string;
}

export interface IPlivoCustomer {
  phoneNumber: string;
  erxesApiId?: string;
  primaryPhone?: string;
  firstName?: string;
  lastName?: string;
  integrationId: string;
}

export interface IPlivoCustomerDocument extends IPlivoCustomer, Document {
  _id: string;
}

/** Direction as Plivo reports it on every callback. */
export type PlivoCallDirection = 'inbound' | 'outbound';

/**
 * Lifecycle of one call.
 *
 * `ringing` and `in-progress` come straight from Plivo's `CallStatus`.
 * `completed` is set by the hangup callback, and `no-answer` / `failed` /
 * `busy` are derived from `HangupCause` because Plivo reports every ended call
 * as `completed` regardless of whether it was actually answered.
 *
 * `unknown` is terminal but asserts NO outcome: it marks a call whose hangup
 * callback never arrived and which Plivo's CDR could not resolve either. It
 * exists so such a row can stop claiming to be live without any of the real
 * outcomes above being invented for it.
 */
export type PlivoCallStatus =
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'no-answer'
  | 'busy'
  | 'failed'
  | 'unknown';

export interface IPlivoCallSession {
  callUuid: string;
  erxesApiConversationId?: string;
  erxesApiMessageId?: string;
  integrationId: string;
  customerId?: string;
  /** Erxes user who owns the call, when it was placed from the inbox. */
  userId?: string;
  direction: PlivoCallDirection;
  status: PlivoCallStatus;
  /** Both stored normalised to E.164 so history can be matched to a contact. */
  from: string;
  to: string;
  /** Seconds the call was connected, per Plivo's `Duration`. */
  duration?: number;
  /** Seconds Plivo billed, rounded up to its minimum increment. */
  billDuration?: number;
  totalCost?: number;
  hangupCause?: string;
  /**
   * What the player reads: an erxes storage key once the recording has been
   * copied into erxes storage, or Plivo's own URL when that copy failed.
   */
  recordUrl?: string;
  /**
   * Plivo's own URL, always kept.
   *
   * Plivo stores recordings free for the first 90 days and bills for storage
   * after that. Retaining the URL lets an operator retry a re-host that failed.
   */
  providerRecordUrl?: string;
  /**
   * When the recording was copied into erxes storage. Unset while `recordUrl`
   * still points at the expiring provider URL.
   */
  recordingStoredAt?: Date;
  recordingUuid?: string;
  recordingDuration?: number;
  /**
   * True when the audio on this row is a VOICEMAIL the caller left because
   * nobody answered — not a recording of a conversation.
   *
   * The distinction is the whole point: a recording is metadata on a call that
   * happened, a voicemail is an unhandled contact that still needs an agent to
   * act. They are kept apart by this flag rather than by a separate collection
   * so one call remains one row.
   */
  isVoicemail?: boolean;
  /** When the caller finished leaving the voicemail. */
  voicemailLeftAt?: Date;
  startedAt?: Date;
  answeredAt?: Date;
  endedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IPlivoCallSessionDocument extends IPlivoCallSession, Document {
  _id: string;
}

/**
 * An attachment on an inbox message this module writes.
 *
 * Mirrors `attachmentSchema` in erxes-api-shared/core-modules, the same shape
 * the WhatsApp integration sends, so call audio arrives in the inbox through
 * the field the message list already reads.
 */
export interface IPlivoMessageAttachment {
  url: string;
  name: string;
  type: string;
  size?: number;
  duration?: number;
}

/**
 * The subset of Plivo's callback parameters this module consumes.
 *
 * Every value arrives as a form-encoded string, including the numeric ones —
 * `Duration`, `BillDuration` and `TotalCost` must be parsed before use.
 * https://www.plivo.com/docs/voice/api/call#the-call-object
 */
export interface IPlivoCallbackParams {
  CallUUID?: string;
  From?: string;
  To?: string;
  Direction?: string;
  CallStatus?: string;
  Event?: string;
  /**
   * Present on the hangup callback only.
   *
   * Plivo's Calls API reference documents the reason as `HangupCauseName` with a
   * numeric `HangupCauseCode`, while the raw telephony string also arrives as
   * `HangupCause`. Both spellings are accepted because which one is sent varies
   * by call flow, and reading only one silently loses the outcome.
   * https://www.plivo.com/docs/voice/api/calls
   */
  HangupCause?: string;
  HangupCauseName?: string;
  HangupCauseCode?: string;
  HangupSource?: string;
  Duration?: string;
  BillDuration?: string;
  BillRate?: string;
  TotalCost?: string;
  AnswerTime?: string;
  EndTime?: string;
  StartTime?: string;
  /**
   * Present on the recording callback only.
   *
   * `CallUUID` is NOT among the parameters Plivo documents for a `<Record>`
   * action or callback URL, which is why a recording is matched on
   * `RecordingID` when it is missing.
   * https://www.plivo.com/docs/voice/xml/record
   */
  RecordUrl?: string;
  RecordingID?: string;
  /** Recording length in SECONDS. */
  RecordingDuration?: string;
  /** The same length in milliseconds, sent alongside the seconds value. */
  RecordingDurationMs?: string;
  RecordingStartMs?: string;
  RecordingEndMs?: string;
  /**
   * Present only on the answer callback for a click-to-call agent leg.
   *
   * Not one of Plivo's own parameters — it rides on the `answer_url` query
   * string that `handlePlivoClickToCall` builds, because the agent's endpoint
   * is what Plivo actually dials for that leg and there is nowhere else to
   * carry "who to bridge to next" across the round trip to Plivo and back.
   * `parseCallbackParams` merges the query string in for exactly this.
   */
  ClickToCallTo?: string;
  /** Erxes user id the click-to-call leg is attributed to. See `ClickToCallTo`. */
  ClickToCallUserId?: string;
  /**
   * Plivo forwards custom SIP headers prefixed `X-PH-`, so an arbitrary key is
   * possible on any callback.
   */
  [key: string]: string | undefined;
}

/** Response from POST /v1/Account/{auth_id}/Call/. */
export interface IPlivoOutboundCallResponse {
  message?: string;
  request_uuid?: string;
  api_id?: string;
  error?: string;
}

/**
 * A Plivo SIP endpoint, as this module uses it.
 *
 * `username` is the name Plivo actually assigned, which is the requested name
 * with a 12-digit number appended — the SIP URI and the token's `sub` must both
 * use this value, not the one that was requested.
 * https://www.plivo.com/docs/voice/api/endpoints
 */
export interface IPlivoEndpoint {
  endpointId: string;
  username: string;
  alias: string;
  /**
   * Whether a SIP client is registered on this endpoint RIGHT NOW.
   *
   * Plivo documents `sip_registered` as a STRING carrying `'true'`/`'false'`,
   * not a boolean, so it is normalised here at the API boundary. Undefined when
   * the field was absent, which is treated as unknown rather than offline.
   */
  sipRegistered?: boolean;
}

/**
 * A SIP endpoint together with the password the browser registers with.
 *
 * The password is NEVER read back from Plivo — `GET /Endpoint/{id}/` returns a
 * stale value that does not authenticate — so it only ever exists here on the
 * path that just wrote it. See `ensurePlivoEndpoint`.
 */
export interface IPlivoEndpointCredentials extends IPlivoEndpoint {
  password: string;
}

/** Response from POST /v1/Account/{auth_id}/Endpoint/. */
export interface IPlivoEndpointCreateResponse {
  endpoint_id?: string;
  username?: string;
  alias?: string;
  message?: string;
  api_id?: string;
}

/** One entry of GET /v1/Account/{auth_id}/Endpoint/. */
export interface IPlivoEndpointListItem {
  endpoint_id?: string;
  username?: string;
  alias?: string;
  /**
   * `'true'` when a SIP client is currently registered on the endpoint.
   *
   * Plivo's attribute table types this as a STRING, defaulting to `'false'` —
   * comparing it as a boolean would make every endpoint look reachable, because
   * the non-empty string `'false'` is itself truthy.
   * https://www.plivo.com/docs/voice/api/endpoints
   */
  sip_registered?: string | boolean;
}

/** Response from GET /v1/Account/{auth_id}/Endpoint/. */
export interface IPlivoEndpointListResponse {
  objects?: IPlivoEndpointListItem[];
  api_id?: string;
}
