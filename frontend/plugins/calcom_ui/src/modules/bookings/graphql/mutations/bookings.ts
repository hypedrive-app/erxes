import { gql } from '@apollo/client';

/**
 * These mutations do not return the updated booking.
 *
 * The backend proxies the change to Cal.com and lets the resulting webhook
 * update the mirror, so there is no fresher row to hand back at this point —
 * the write has been accepted, not yet observed. Callers refetch instead of
 * merging a returned record, which is also why an optimistic cache write would
 * be wrong here: it would assert a state Cal.com has not confirmed.
 */
export const CALCOM_CANCEL_BOOKING = gql`
  mutation CalcomCancelBooking($uid: String!, $cancellationReason: String) {
    calcomCancelBooking(uid: $uid, cancellationReason: $cancellationReason) {
      ok
      uid
    }
  }
`;

export const CALCOM_RESCHEDULE_BOOKING = gql`
  mutation CalcomRescheduleBooking(
    $uid: String!
    $start: String!
    $reschedulingReason: String
  ) {
    calcomRescheduleBooking(
      uid: $uid
      start: $start
      reschedulingReason: $reschedulingReason
    ) {
      ok
      uid
    }
  }
`;

export const CALCOM_MARK_NO_SHOW = gql`
  mutation CalcomMarkNoShow(
    $uid: String!
    $noShowHost: Boolean
    $attendees: [CalcomAttendeeAbsenceInput!]
  ) {
    calcomMarkNoShow(
      uid: $uid
      noShowHost: $noShowHost
      attendees: $attendees
    ) {
      ok
      uid
    }
  }
`;

export const CALCOM_CREATE_BOOKING = gql`
  mutation CalcomCreateBooking(
    $eventTypeId: Int!
    $start: String!
    $attendee: CalcomBookingAttendeeInput!
    $customerId: String
  ) {
    calcomCreateBooking(
      eventTypeId: $eventTypeId
      start: $start
      attendee: $attendee
      customerId: $customerId
    ) {
      ok
      uid
    }
  }
`;
