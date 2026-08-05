export const types = `
  """
  A Cal.com team — the unit round-robin and collective event types are
  configured against. Read/written live, same as CalcomSchedule: team
  membership and setup have no webhook of their own to keep a mirror current.
  """
  type CalcomTeam {
    id: Int
    name: String
    slug: String
    logoUrl: String
    bio: String
  }

  type CalcomTeamMembership {
    id: Int
    userId: Int
    teamId: Int
    role: String
    accepted: Boolean
  }

  """
  A team-scoped event type. Same shape as CalcomEventTypeDetail; kept
  separate because it always carries a teamId and the create/update calls hit
  a team-scoped endpoint.
  """
  type CalcomTeamEventType {
    id: Int
    teamId: Int
    title: String
    slug: String
    lengthInMinutes: Int
    description: String
    hidden: Boolean
  }
`;

export const queries = `
  calcomTeams: [CalcomTeam]
  calcomTeam(teamId: Int!): CalcomTeam
  calcomTeamMemberships(teamId: Int!): [CalcomTeamMembership]
  calcomTeamEventTypes(teamId: Int!): [CalcomTeamEventType]
`;

export const mutations = `
  calcomCreateTeam(
    name: String!
    slug: String
    logoUrl: String
    bio: String
  ): CalcomTeam

  calcomUpdateTeam(
    teamId: Int!
    name: String
    slug: String
    logoUrl: String
    bio: String
  ): CalcomTeam

  calcomDeleteTeam(teamId: Int!): CalcomWriteResult

  calcomAddTeamMember(
    teamId: Int!
    userId: Int!
    role: String
    accepted: Boolean
  ): CalcomTeamMembership

  calcomUpdateTeamMember(
    teamId: Int!
    membershipId: Int!
    role: String
    accepted: Boolean
  ): CalcomTeamMembership

  calcomRemoveTeamMember(teamId: Int!, membershipId: Int!): CalcomWriteResult

  calcomCreateTeamEventType(
    teamId: Int!
    title: String!
    slug: String!
    lengthInMinutes: Int!
    description: String
    hidden: Boolean
  ): CalcomTeamEventType

  calcomUpdateTeamEventType(
    teamId: Int!
    eventTypeId: Int!
    title: String
    slug: String
    lengthInMinutes: Int
    description: String
    hidden: Boolean
  ): CalcomTeamEventType

  calcomDeleteTeamEventType(teamId: Int!, eventTypeId: Int!): CalcomWriteResult
`;
