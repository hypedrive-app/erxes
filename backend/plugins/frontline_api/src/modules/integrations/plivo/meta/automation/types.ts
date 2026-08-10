/**
 * The target object `registerCallHangup` enrols into automations when a call
 * ends — the single source of truth for the shape every worker reads back off
 * the execution. The automation bridge transports targets as untyped records,
 * so producers build this type and consumers cast back to it.
 *
 * The trigger fires on the END of a call rather than its start, because that is
 * the only moment the facts a workflow branches on exist: whether anyone
 * answered, how long it lasted, and why it ended. A trigger at ring time could
 * only say a call arrived.
 */
export type TPlivoTriggerTarget = {
  // Plivo's call uuid, stable across redeliveries of the same hangup callback.
  _id: string;
  // 'inbound' | 'outbound' — which way the call went.
  direction: string;
  // Our own outcome, not Plivo's raw cause: completed | missed | busy | failed |
  // voicemail | unknown. This is what a workflow branches on.
  status: string;
  // The other party's number, in whatever form Plivo reported it.
  from: string;
  to: string;
  // Seconds of connected audio. 0 on a call nobody answered.
  duration: number;
  // Inbox conversation id (`erxesApiId`), absent when the call never produced
  // one.
  conversationId?: string;
  // Core customer id (`erxesApiId`).
  customerId?: string;
  // The agent who handled it, when one did.
  userId?: string;
  // Plivo's own hangup cause, kept verbatim for workflows that need to tell
  // apart reasons our five statuses collapse together.
  hangupCause?: string;
  // True when the caller left a voicemail rather than reaching an agent.
  isVoicemail?: boolean;
  createdAt?: Date | string;
};

/**
 * Config of the call trigger, set in the trigger form.
 *
 * Both filters are optional and independent; leaving both unset means "every
 * call", which is the common case for logging or follow-up workflows.
 */
export type TPlivoTriggerConfig = {
  // 'inbound' | 'outbound' | '' — '' or absent means either.
  direction?: string;
  // Comma-separated list of outcomes to match, e.g. "missed,voicemail" for a
  // callback workflow. Empty means any outcome.
  statuses?: string;
};
