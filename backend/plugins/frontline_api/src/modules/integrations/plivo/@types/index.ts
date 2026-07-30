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
   * Plivo deletes recordings 30 days after creation, so this URL has a finite
   * life — anything needing permanent audio must copy the file elsewhere.
   */
  recordUrl?: string;
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
  /** Present on the hangup callback only. */
  HangupCause?: string;
  HangupSource?: string;
  Duration?: string;
  BillDuration?: string;
  BillRate?: string;
  TotalCost?: string;
  AnswerTime?: string;
  EndTime?: string;
  StartTime?: string;
  /** Present on the recording callback only. */
  RecordUrl?: string;
  RecordingID?: string;
  RecordingDuration?: string;
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
