import {
  PLIVO_CALL_ACTION_METHOD,
  PLIVO_CALL_COLLECTION,
  PLIVO_MODULE_NAME,
} from '@/integrations/plivo/constants';

// Trigger fields, addressable in actions as {{ trigger.<key> }}.
//
// Every key here must exist on TPlivoTriggerTarget and be populated by the
// emitter: the builder offers these to the user as available variables, so a
// key declared but never set renders as an empty string at run time with no
// error anywhere.
const plivoCallTriggerOutput = {
  variables: [
    { key: '_id', label: 'Call UUID' },
    { key: 'direction', label: 'Direction (inbound/outbound)' },
    { key: 'status', label: 'Outcome (completed/missed/busy/failed/voicemail)' },
    { key: 'from', label: 'Caller number' },
    { key: 'to', label: 'Number called' },
    { key: 'duration', label: 'Talk time in seconds' },
    { key: 'conversationId', label: 'Conversation ID' },
    { key: 'customerId', label: 'Customer ID' },
    { key: 'userId', label: 'Agent who handled it' },
    { key: 'hangupCause', label: "Plivo's hangup cause" },
    { key: 'isVoicemail', label: 'Caller left a voicemail' },
    { key: 'createdAt', label: 'Call ended at' },
  ],
};

// Fields the action exposes to whatever follows it.
const plivoCallActionOutput = {
  variables: [
    { key: 'requestUuid', label: 'Plivo request UUID' },
    { key: 'to', label: 'Number called' },
    { key: 'userId', label: 'Agent whose softphone was rung' },
  ],
};

export const plivoConstants = {
  actions: [
    {
      moduleName: PLIVO_MODULE_NAME,
      collectionName: PLIVO_CALL_COLLECTION,
      method: PLIVO_CALL_ACTION_METHOD,
      icon: 'IconPhone',
      label: 'Place a Call',
      description:
        "Ring an agent's softphone and, once they pick up, bridge them to the customer. The agent must be logged in with the call widget open — this dials a browser softphone, not a desk phone, so an offline agent's leg simply goes unanswered.",
      output: plivoCallActionOutput,
    },
  ],
  triggers: [
    {
      moduleName: PLIVO_MODULE_NAME,
      collectionName: PLIVO_CALL_COLLECTION,
      icon: 'IconPhone',
      label: 'Call Ended',
      description:
        'Start this workflow when a call finishes. Fires on the outcome — answered, missed, busy, failed or voicemail — because that is the moment the facts a workflow branches on exist. Filter by direction and outcome in the trigger settings.',
      isCustom: true,
      output: plivoCallTriggerOutput,
    },
  ],
};
