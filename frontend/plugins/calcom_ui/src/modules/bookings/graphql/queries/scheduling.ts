import { gql } from '@apollo/client';

/**
 * Live reads from Cal.com, not from the mirror.
 *
 * Event types are configuration and slots are computed against calendars erxes
 * cannot see. Neither is announced by a webhook, so both must be asked for at
 * the moment they are needed — a cached slot is stale as soon as somebody else
 * books it.
 */
export const CALCOM_EVENT_TYPES_QUERY = gql`
  query CalcomEventTypes($username: String) {
    calcomEventTypes(username: $username) {
      id
      title
      slug
      length
      description
      hidden
    }
  }
`;

export const CALCOM_SLOTS_QUERY = gql`
  query CalcomSlots(
    $eventTypeId: Int!
    $start: String!
    $end: String!
    $timeZone: String
  ) {
    calcomSlots(
      eventTypeId: $eventTypeId
      start: $start
      end: $end
      timeZone: $timeZone
    ) {
      start
      end
    }
  }
`;
