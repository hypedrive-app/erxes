export const types = `
  """A connected Plivo number this agent can answer on in the browser."""
  type PlivoSoftphoneIntegration {
    """Inbox integration id, the value plivoAccessToken is asked for."""
    _id: String!
    """Inbox name of the integration, for the picker."""
    name: String!
    """The rented number in E.164, shown as the caller id."""
    phoneNumber: String
  }

  type PlivoAccessToken {
    """Short-lived JWT the browser SDK logs in with. Never cache it past expiresAt."""
    token: String!
    """SIP endpoint username the token authenticates as."""
    username: String!
    """Unix seconds at which the token stops being accepted."""
    expiresAt: Float!
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
`;

export const queries = `
  plivoSoftphoneIntegrations: [PlivoSoftphoneIntegration]
  plivoAccessToken(integrationId: String!): PlivoAccessToken
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
