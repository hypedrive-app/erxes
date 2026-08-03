export const types = `
  type CalcomBookingAttendee {
    email: String
    name: String
    timeZone: String
    erxesCustomerId: String
  }

  type Bookings {
    _id: String
    uid: String
    bookingId: Int

    title: String
    description: String
    status: String

    startTime: Date
    endTime: Date

    eventTypeId: Int
    eventTypeSlug: String

    organizerEmail: String
    organizerName: String

    attendees: [CalcomBookingAttendee]

    location: String
    meetingUrl: String

    rescheduledFromUid: String
    cancelledBy: String
    cancellationReason: String

    paymentStatus: String
    noShowHost: Boolean

    lastTriggerEvent: String
    lastPayloadAt: Date

    createdAt: Date
    updatedAt: Date
  }

  type BookingsListResponse {
    list: [Bookings]
    totalCount: Int
  }
`;

export const queries = `
  calcomBooking(_id: String, uid: String): Bookings
  calcomBookings(
    customerId: String
    status: String
    startDate: Date
    endDate: Date
    page: Int
    perPage: Int
  ): BookingsListResponse
`;

/**
 * Deliberately read-only.
 *
 * Cal.com owns these records; this plugin mirrors them from webhooks. A
 * create/update/remove mutation here would either drift from Cal.com the moment
 * it was used, or need a write path back into Cal.com's API — which is a
 * separate feature with its own conflict semantics, not something to smuggle in
 * behind a generated CRUD stub.
 */
export const mutations = ``;
