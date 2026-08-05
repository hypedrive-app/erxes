export const types = `
  """
  A bookable event type's configuration, read/written live against Cal.com.

  Not mirrored, same as the read-only CalcomEventType in bookings' schema:
  configuration has no webhook of its own, so a stored copy would drift the
  moment someone edited it in Cal.com directly.
  """
  type CalcomEventTypeDetail {
    id: Int
    title: String
    slug: String
    lengthInMinutes: Int
    description: String
    hidden: Boolean
    locations: [JSON]
  }

  input CalcomEventTypeLocationInput {
    type: String!
  }
`;

export const queries = `
  """Full detail for one event type, for editing — CalcomEventTypes gives the list."""
  calcomEventType(eventTypeId: Int!): CalcomEventTypeDetail
`;

export const mutations = `
  calcomCreateEventType(
    title: String!
    slug: String!
    lengthInMinutes: Int!
    description: String
    locations: [CalcomEventTypeLocationInput!]
    hidden: Boolean
  ): CalcomEventTypeDetail

  calcomUpdateEventType(
    eventTypeId: Int!
    title: String
    slug: String
    lengthInMinutes: Int
    description: String
    locations: [CalcomEventTypeLocationInput!]
    hidden: Boolean
  ): CalcomEventTypeDetail

  calcomDeleteEventType(eventTypeId: Int!): CalcomWriteResult
`;
