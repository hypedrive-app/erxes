/**
 * Connection lifecycle of the Plivo browser client.
 *
 * Mirrors `SipStatusEnum` from the Grandstream softphone so the two widgets
 * read the same way, but the values are namespaced separately because the two
 * clients are driven by different SDKs with their own lifecycles.
 */
export enum PlivoStatusEnum {
  DISCONNECTED = 'plivoStatus/DISCONNECTED',
  CONNECTING = 'plivoStatus/CONNECTING',
  CONNECTED = 'plivoStatus/CONNECTED',
  REGISTERED = 'plivoStatus/REGISTERED',
  ERROR = 'plivoStatus/ERROR',
}

export enum PlivoErrorTypeEnum {
  CONFIGURATION = 'plivoErrorType/CONFIGURATION',
  CONNECTION = 'plivoErrorType/CONNECTION',
  REGISTRATION = 'plivoErrorType/REGISTRATION',
  /** The browser refused microphone access, so no call can be placed at all. */
  MEDIA_PERMISSION = 'plivoErrorType/MEDIA_PERMISSION',
  /** Autoplay policy blocked remote audio; the call is up but silent. */
  AUDIO_PLAYBACK = 'plivoErrorType/AUDIO_PLAYBACK',
  /**
   * The call is connected but no RTP is flowing in either direction — the
   * signature of a network that permits the signalling and drops the media.
   * Distinct from AUDIO_PLAYBACK, which is our own tab failing to play audio
   * that did arrive.
   */
  MEDIA_BLOCKED = 'plivoErrorType/MEDIA_BLOCKED',
  /** The microphone is live and unmuted but producing pure silence. */
  MEDIA_SILENT_MIC = 'plivoErrorType/MEDIA_SILENT_MIC',
}

export enum PlivoCallStatusEnum {
  IDLE = 'plivoCallStatus/IDLE',
  STARTING = 'plivoCallStatus/STARTING',
  RINGING = 'plivoCallStatus/RINGING',
  ACTIVE = 'plivoCallStatus/ACTIVE',
  FAILED = 'plivoCallStatus/FAILED',
  ENDED = 'plivoCallStatus/ENDED',
}

export enum PlivoCallDirectionEnum {
  INCOMING = 'plivoCallDirection/INCOMING',
  OUTGOING = 'plivoCallDirection/OUTGOING',
}

/**
 * Coarse call quality, derived from the SDK's `mediaMetrics` event.
 *
 * Plivo emits a warning when a metric degrades and a matching event when it
 * recovers, so quality is tracked as a level rather than raw numbers.
 * Chrome-only: other browsers never emit the event, which is why `UNKNOWN`
 * exists and is not treated as a fault.
 */
export enum PlivoCallQualityEnum {
  UNKNOWN = 'plivoCallQuality/UNKNOWN',
  GOOD = 'plivoCallQuality/GOOD',
  DEGRADED = 'plivoCallQuality/DEGRADED',
}

/**
 * State of the softphone, shaped after `ISipState` so the two providers stay
 * comparable. `callId` holds Plivo's CallUUID, which every call control method
 * needs, and which the Grandstream equivalent leaves null.
 */
export interface IPlivoState {
  plivoStatus: PlivoStatusEnum;
  plivoErrorType: PlivoErrorTypeEnum | null;
  plivoErrorMessage: string | null;
  callStatus: PlivoCallStatusEnum;
  callDirection: PlivoCallDirectionEnum | null;
  callCounterpart: string | null;
  callerName: string | null;
  callId: string | null;
  callQuality: PlivoCallQualityEnum;
  isMuted: boolean;
}

/** Metric names Plivo reports on the `mediaMetrics` event. */
export interface IPlivoMediaMetric {
  type?: string;
  group?: string;
  level?: string;
  value?: number;
  active?: boolean;
}

/**
 * SIP credentials this agent's browser softphone registers with.
 *
 * Plivo's registrar refuses JWT registration on this account, so the SDK is
 * driven with `client.login(username, password)` rather than a token. The
 * password belongs to one endpoint provisioned for this agent alone.
 */
export interface IPlivoSoftphoneCredentials {
  username: string;
  password: string;
  endpointUri: string;
  phoneNumber?: string | null;
}

/** A Plivo number the agent can answer on, as offered by the widget picker. */
export interface IPlivoSoftphoneIntegration {
  _id: string;
  name: string;
  phoneNumber?: string | null;
  /**
   * Dialing code the dialpad parses typed numbers against, as digits (`'91'`).
   * Null when the admin has not set one — see `resolvePlivoCountry`.
   */
  defaultCountryCode?: string | null;
}

/**
 * A connected number's settings, as the integration config screen edits them.
 *
 * There is no `authToken`: it is write-only on the server and never reaches the
 * browser. Booleans and seconds arrive already resolved to their EFFECTIVE
 * values, so the form shows what inbound routing is actually doing rather than
 * a blank for every field that was left at its default.
 */
export interface IPlivoIntegrationConfig {
  _id: string;
  name?: string | null;
  authId?: string | null;
  plivoPhoneNumber?: string | null;
  appId?: string | null;
  defaultCountryCode?: string | null;
  recordCalls: boolean;
  forwardToNumber?: string | null;
  forwardTimeout: number;
  ringAgents: boolean;
  agentRingTimeout: number;
  voicemailEnabled: boolean;
  voicemailMaxLength: number;
  voicemailGreeting: string;
  healthStatus?: string | null;
  error?: string | null;
}

/** Direction exactly as the backend stores it, which is how Plivo reports it. */
export type PlivoHistoryDirection = 'inbound' | 'outbound';

/**
 * Call lifecycle as stored on the session row.
 *
 * Every ended call is reported by Plivo as `completed` regardless of whether it
 * was answered, so `no-answer` / `busy` / `failed` are derived from the hangup
 * cause on the backend and arrive here already resolved.
 */
export type PlivoHistoryStatus =
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'no-answer'
  | 'busy'
  | 'failed';

/** The contact a call was matched to, when it was matched to one. */
export interface IPlivoCallContact {
  _id: string;
  firstName?: string | null;
  lastName?: string | null;
  primaryPhone?: string | null;
  avatar?: string | null;
}

/** One row of Plivo call history. */
export interface IPlivoCallHistory {
  _id: string;
  callUuid?: string | null;
  conversationId?: string | null;
  direction?: PlivoHistoryDirection | null;
  status?: PlivoHistoryStatus | null;
  from?: string | null;
  to?: string | null;
  /** The number of the party that is not this Plivo integration. */
  counterpartNumber?: string | null;
  duration?: number | null;
  /**
   * Plivo's billed seconds and charge. `billDuration` is deliberately not
   * shown: it differs from `duration` only because billing rounds up to the
   * minute, which is an accounting detail, while the cost it produces is the
   * number anyone actually wants.
   */
  billDuration?: number | null;
  totalCost?: number | null;
  hangupCause?: string | null;
  /** Storage key or absolute URL; `getPlivoRecordingUrl` accepts either. */
  recordUrl?: string | null;
  recordingDuration?: number | null;
  /**
   * True when the audio is a VOICEMAIL — a caller who could not reach anyone
   * and still needs an agent to act — rather than a recording of a call that
   * actually happened. The list keeps the two visually apart on this flag.
   */
  isVoicemail?: boolean | null;
  voicemailLeftAt?: string | null;
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  createdAt?: string | null;
  customer?: IPlivoCallContact | null;
}

/** A page of call history plus the count the list pages against. */
export interface IPlivoCallHistoryList {
  list: IPlivoCallHistory[];
  totalCount: number;
}

/**
 * How a call reads once direction and outcome are collapsed into one label.
 *
 * `voicemail` is deliberately its own outcome and not a flavour of `missed`:
 * a voicemail is a missed call that left something to listen to, and treating
 * it as merely missed is exactly the conflation this UI exists to prevent.
 */
export type PlivoCallOutcome =
  | 'answered'
  | 'voicemail'
  | 'missed'
  | 'busy'
  | 'failed'
  | 'in-progress';

export interface PlivoContextValue {
  /** Logs the client in again with the credentials already in hand. */
  reconnectPlivo: () => void;
  /** Unregisters the endpoint so the agent stops receiving calls. */
  unregisterPlivo: () => void;
  answerCall: () => void;
  rejectCall: () => void;
  startCall: (destination: string) => void;
  stopCall: () => void;
  mute: () => void;
  unmute: () => void;
  sendDtmf: (digit: string) => void;
  /**
   * Hold is deliberately absent.
   *
   * Plivo's Browser SDK v2 exposes no hold/unhold — verified against the
   * package's own `index.d.ts`, which has `mute`, `unmute`, `sendDtmf`,
   * `answer`, `reject`, `ignore` and `hangup` but nothing for hold. The
   * Grandstream softphone has it because JsSIP implements re-INVITE hold
   * directly; faking it here would leave the caller connected and unaware.
   */
  phoneNumber?: string | null;
}
