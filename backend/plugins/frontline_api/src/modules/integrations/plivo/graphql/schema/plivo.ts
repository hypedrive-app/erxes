export const types = `
  """A connected Plivo number this agent can answer on in the browser."""
  type PlivoSoftphoneIntegration {
    """Inbox integration id, the value plivoSoftphoneCredentials is asked for."""
    _id: String!
    """Inbox name of the integration, for the picker."""
    name: String!
    """The rented number in E.164, shown as the caller id."""
    phoneNumber: String
  }

  """
  SIP credentials for ONE agent's browser softphone.

  Replaces the JWT this integration used to mint: Plivo's registrar refuses JWT
  registration on this account, while username+password registration on the same
  endpoint succeeds. The password is a live SIP credential and is only ever
  returned to the agent whose endpoint it is — the resolver derives the endpoint
  from the session user, so there is no argument that could name another agent's.
  """
  type PlivoSoftphoneCredentials {
    """SIP endpoint username, as Plivo assigned it."""
    username: String!
    """SIP password. Write-only at Plivo, so this is the only copy that works."""
    password: String!
    """Endpoint URI an inbound <Dial><User> must target to ring this browser."""
    endpointUri: String!
    """Caller id outbound browser calls are placed from."""
    phoneNumber: String
  }

  """
  The contact on the other end of a call, resolved from core contacts.

  Present only when the call was matched to a contact; the history row falls
  back to the raw number so an unmatched call is still readable.
  """
  type PlivoCallContact {
    _id: String!
    firstName: String
    lastName: String
    primaryPhone: String
    avatar: String
  }

  """
  One Plivo call, as call history renders it.

  Deliberately excludes every credential on the integration: this type carries
  only what a call log shows.
  """
  type PlivoCallHistory {
    _id: String!
    """Plivo's own id for the call."""
    callUuid: String
    """Inbox conversation this call was delivered to, when it reached the inbox."""
    conversationId: String
    """'inbound' or 'outbound', as Plivo reported it."""
    direction: String
    """ringing | in-progress | completed | no-answer | busy | failed."""
    status: String
    """Caller number in E.164."""
    from: String
    """Called number in E.164."""
    to: String
    """The number of the party that is NOT this Plivo integration."""
    counterpartNumber: String
    """Seconds the call was connected."""
    duration: Float
    """Why the call ended; the only way to tell a missed call from a short one."""
    hangupCause: String
    """
    What the player reads: an erxes storage key once the recording has been
    re-hosted, or Plivo's own URL when re-hosting failed.
    """
    recordUrl: String
    """Recording length in seconds."""
    recordingDuration: Float
    """
    True when the audio is a VOICEMAIL the caller left because nobody answered
    — an unhandled contact needing action, not a recording of a conversation.
    """
    isVoicemail: Boolean
    """When the caller finished leaving the voicemail."""
    voicemailLeftAt: Date
    startedAt: Date
    answeredAt: Date
    endedAt: Date
    createdAt: Date
    """Resolved contact, when the caller was matched to one."""
    customer: PlivoCallContact
  }

  """A page of call history plus the count the list pages against."""
  type PlivoCallHistoryList {
    list: [PlivoCallHistory]
    totalCount: Int
  }

  """
  A connected Plivo number's settings, as the integration config screen edits
  them.

  The auth token is deliberately ABSENT from this type. It is the account secret
  AND the HMAC key that verifies inbound callbacks, so it is write-only: it can
  be replaced, never read back. Every other field round-trips so the form shows
  what live call routing is actually doing.
  """
  type PlivoIntegrationConfig {
    """Inbox integration id these settings belong to."""
    _id: String!
    """Inbox name of the integration."""
    name: String
    """The account auth id. Not a secret on its own — the token is."""
    authId: String
    """The rented number in E.164."""
    plivoPhoneNumber: String
    """Plivo application that owns the answer/hangup URLs."""
    appId: String
    """Dialing code prefixed to caller numbers that arrive without one."""
    defaultCountryCode: String
    """Record answered calls."""
    recordCalls: Boolean
    """E.164 number an unanswered call falls back to; empty means no fallback."""
    forwardToNumber: String
    """Seconds to ring the fallback number before giving up."""
    forwardTimeout: Int
    """Ring logged-in agents' browser softphones before the fallback number."""
    ringAgents: Boolean
    """Seconds to ring the agents' softphones before falling back."""
    agentRingTimeout: Int
    """Take a voicemail when nobody answered."""
    voicemailEnabled: Boolean
    """Seconds of voicemail to accept before stopping the recording."""
    voicemailMaxLength: Int
    """Prompt read to the caller before the beep."""
    voicemailGreeting: String
    """healthy | error, as of the last credential check."""
    healthStatus: String
    """Why the integration is broken, when it is."""
    error: String
  }
`;

export const queries = `
  plivoSoftphoneIntegrations: [PlivoSoftphoneIntegration]
  plivoIntegrationConfigs: [PlivoIntegrationConfig]
  plivoSoftphoneCredentials(integrationId: String!): PlivoSoftphoneCredentials
  plivoCallHistories(
    integrationId: String
    direction: String
    isVoicemail: Boolean
    hasRecording: Boolean
    searchValue: String
    limit: Int
    skip: Int
  ): PlivoCallHistoryList
`;

export const mutations = ``;
