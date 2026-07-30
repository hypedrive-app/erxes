export const types = `
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
  plivoAccessToken(integrationId: String!): PlivoAccessToken
`;

export const mutations = ``;
