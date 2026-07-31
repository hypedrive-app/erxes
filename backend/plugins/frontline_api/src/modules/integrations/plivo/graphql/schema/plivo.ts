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
`;

export const queries = `
  plivoSoftphoneIntegrations: [PlivoSoftphoneIntegration]
  plivoAccessToken(integrationId: String!): PlivoAccessToken
`;

export const mutations = ``;
