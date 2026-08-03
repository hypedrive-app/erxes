import { gql } from '@apollo/client';

/**
 * Field set shared by the list and the detail query.
 *
 * Kept as one fragment rather than a lean list projection plus a fat detail
 * one: a booking document is small and fully denormalised, so a second network
 * round trip on row-expand would cost more than the handful of extra fields,
 * and having both queries return the same shape means a row opened from the
 * list renders from cache instead of flashing a spinner.
 */
export const CALCOM_BOOKING_FIELDS = gql`
  fragment CalcomBookingFields on Bookings {
    _id
    uid
    bookingId

    title
    description
    status

    startTime
    endTime

    eventTypeId
    eventTypeSlug

    organizerEmail
    organizerName

    attendees {
      email
      name
      timeZone
      erxesCustomerId
    }

    location
    meetingUrl

    rescheduledFromUid
    cancelledBy
    cancellationReason

    paymentStatus
    noShowHost

    lastTriggerEvent
    lastPayloadAt

    createdAt
    updatedAt
  }
`;

export const CALCOM_BOOKINGS_QUERY = gql`
  query CalcomBookings(
    $customerId: String
    $status: String
    $startDate: Date
    $endDate: Date
    $page: Int
    $perPage: Int
  ) {
    calcomBookings(
      customerId: $customerId
      status: $status
      startDate: $startDate
      endDate: $endDate
      page: $page
      perPage: $perPage
    ) {
      list {
        ...CalcomBookingFields
      }
      totalCount
    }
  }
  ${CALCOM_BOOKING_FIELDS}
`;

export const CALCOM_BOOKING_QUERY = gql`
  query CalcomBooking($_id: String, $uid: String) {
    calcomBooking(_id: $_id, uid: $uid) {
      ...CalcomBookingFields
    }
  }
  ${CALCOM_BOOKING_FIELDS}
`;
