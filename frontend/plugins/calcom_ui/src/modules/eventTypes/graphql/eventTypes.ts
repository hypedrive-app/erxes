import { gql } from '@apollo/client';

/**
 * List uses bookings' existing calcomEventTypes (title/slug/length only — a
 * live Cal.com read, same source this reuses rather than duplicating). Detail
 * and writes need the full CalcomEventTypeDetail this plugin's backend adds.
 */
export const CALCOM_EVENT_TYPES_QUERY = gql`
  query CalcomEventTypesList {
    calcomEventTypes {
      id
      title
      slug
      length
      description
      hidden
    }
  }
`;

export const CALCOM_EVENT_TYPE_QUERY = gql`
  query CalcomEventType($eventTypeId: Int!) {
    calcomEventType(eventTypeId: $eventTypeId) {
      id
      title
      slug
      lengthInMinutes
      description
      hidden
    }
  }
`;

export const CALCOM_CREATE_EVENT_TYPE = gql`
  mutation CalcomCreateEventType(
    $title: String!
    $slug: String!
    $lengthInMinutes: Int!
    $description: String
    $hidden: Boolean
  ) {
    calcomCreateEventType(
      title: $title
      slug: $slug
      lengthInMinutes: $lengthInMinutes
      description: $description
      hidden: $hidden
    ) {
      id
      title
      slug
      lengthInMinutes
      description
      hidden
    }
  }
`;

export const CALCOM_UPDATE_EVENT_TYPE = gql`
  mutation CalcomUpdateEventType(
    $eventTypeId: Int!
    $title: String
    $slug: String
    $lengthInMinutes: Int
    $description: String
    $hidden: Boolean
  ) {
    calcomUpdateEventType(
      eventTypeId: $eventTypeId
      title: $title
      slug: $slug
      lengthInMinutes: $lengthInMinutes
      description: $description
      hidden: $hidden
    ) {
      id
      title
      slug
      lengthInMinutes
      description
      hidden
    }
  }
`;

export const CALCOM_DELETE_EVENT_TYPE = gql`
  mutation CalcomDeleteEventType($eventTypeId: Int!) {
    calcomDeleteEventType(eventTypeId: $eventTypeId) {
      ok
    }
  }
`;
