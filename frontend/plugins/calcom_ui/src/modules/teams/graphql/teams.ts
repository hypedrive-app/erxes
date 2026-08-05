import { gql } from '@apollo/client';

export const CALCOM_TEAM_FIELDS = gql`
  fragment CalcomTeamFields on CalcomTeam {
    id
    name
    slug
    logoUrl
    bio
  }
`;

export const CALCOM_TEAMS_QUERY = gql`
  query CalcomTeams {
    calcomTeams {
      ...CalcomTeamFields
    }
  }
  ${CALCOM_TEAM_FIELDS}
`;

export const CALCOM_CREATE_TEAM = gql`
  mutation CalcomCreateTeam($name: String!, $slug: String, $bio: String) {
    calcomCreateTeam(name: $name, slug: $slug, bio: $bio) {
      ...CalcomTeamFields
    }
  }
  ${CALCOM_TEAM_FIELDS}
`;

export const CALCOM_UPDATE_TEAM = gql`
  mutation CalcomUpdateTeam(
    $teamId: Int!
    $name: String
    $slug: String
    $bio: String
  ) {
    calcomUpdateTeam(teamId: $teamId, name: $name, slug: $slug, bio: $bio) {
      ...CalcomTeamFields
    }
  }
  ${CALCOM_TEAM_FIELDS}
`;

export const CALCOM_DELETE_TEAM = gql`
  mutation CalcomDeleteTeam($teamId: Int!) {
    calcomDeleteTeam(teamId: $teamId) {
      ok
    }
  }
`;

export const CALCOM_TEAM_MEMBERSHIPS_QUERY = gql`
  query CalcomTeamMemberships($teamId: Int!) {
    calcomTeamMemberships(teamId: $teamId) {
      id
      userId
      teamId
      role
      accepted
    }
  }
`;

export const CALCOM_ADD_TEAM_MEMBER = gql`
  mutation CalcomAddTeamMember($teamId: Int!, $userId: Int!, $role: String) {
    calcomAddTeamMember(teamId: $teamId, userId: $userId, role: $role) {
      id
      userId
      teamId
      role
      accepted
    }
  }
`;

export const CALCOM_UPDATE_TEAM_MEMBER = gql`
  mutation CalcomUpdateTeamMember(
    $teamId: Int!
    $membershipId: Int!
    $role: String
  ) {
    calcomUpdateTeamMember(
      teamId: $teamId
      membershipId: $membershipId
      role: $role
    ) {
      id
      userId
      teamId
      role
      accepted
    }
  }
`;

export const CALCOM_REMOVE_TEAM_MEMBER = gql`
  mutation CalcomRemoveTeamMember($teamId: Int!, $membershipId: Int!) {
    calcomRemoveTeamMember(teamId: $teamId, membershipId: $membershipId) {
      ok
    }
  }
`;

export const CALCOM_TEAM_EVENT_TYPES_QUERY = gql`
  query CalcomTeamEventTypes($teamId: Int!) {
    calcomTeamEventTypes(teamId: $teamId) {
      id
      teamId
      title
      slug
      lengthInMinutes
      description
      hidden
    }
  }
`;

export const CALCOM_CREATE_TEAM_EVENT_TYPE = gql`
  mutation CalcomCreateTeamEventType(
    $teamId: Int!
    $title: String!
    $slug: String!
    $lengthInMinutes: Int!
    $description: String
    $hidden: Boolean
  ) {
    calcomCreateTeamEventType(
      teamId: $teamId
      title: $title
      slug: $slug
      lengthInMinutes: $lengthInMinutes
      description: $description
      hidden: $hidden
    ) {
      id
      teamId
      title
      slug
      lengthInMinutes
      description
      hidden
    }
  }
`;

export const CALCOM_UPDATE_TEAM_EVENT_TYPE = gql`
  mutation CalcomUpdateTeamEventType(
    $teamId: Int!
    $eventTypeId: Int!
    $title: String
    $slug: String
    $lengthInMinutes: Int
    $description: String
    $hidden: Boolean
  ) {
    calcomUpdateTeamEventType(
      teamId: $teamId
      eventTypeId: $eventTypeId
      title: $title
      slug: $slug
      lengthInMinutes: $lengthInMinutes
      description: $description
      hidden: $hidden
    ) {
      id
      teamId
      title
      slug
      lengthInMinutes
      description
      hidden
    }
  }
`;

export const CALCOM_DELETE_TEAM_EVENT_TYPE = gql`
  mutation CalcomDeleteTeamEventType($teamId: Int!, $eventTypeId: Int!) {
    calcomDeleteTeamEventType(teamId: $teamId, eventTypeId: $eventTypeId) {
      ok
    }
  }
`;
