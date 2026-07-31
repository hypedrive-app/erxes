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
  healthStatus?: string;
  error?: string;
}

export interface IPlivoIntegrationDocument extends IPlivoIntegration, Document {
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
 */
export type PlivoCallStatus =
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'no-answer'
  | 'busy'
  | 'failed';

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
}

/** Response from GET /v1/Account/{auth_id}/Endpoint/. */
export interface IPlivoEndpointListResponse {
  objects?: IPlivoEndpointListItem[];
  api_id?: string;
}
