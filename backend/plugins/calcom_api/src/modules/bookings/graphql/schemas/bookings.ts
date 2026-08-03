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

    """
    Computed per request, never stored: these are relative to "now" and a
    stored copy would be wrong the moment it was written.
    """
    isUpcoming: Boolean
    isPast: Boolean
    durationMinutes: Int
  }

  type BookingsListResponse {
    list: [Bookings]
    totalCount: Int
  }

  """
  A bookable event type, read live from Cal.com.

  Not mirrored: event types are configuration rather than events, no webhook
  announces a change to one, and a stale copy would offer people slots against
  a duration or availability that no longer exists.
  """
  type CalcomEventType {
    id: Int
    title: String
    slug: String
    length: Int
    description: String
    hidden: Boolean
  }

  """
  A free slot, computed by Cal.com against calendars erxes cannot see. Read
  live for the same reason — availability is stale the moment it is cached.
  """
  type CalcomSlot {
    start: String
    end: String
  }

  """
  The outcome of a write proxied to Cal.com.

  Deliberately does not return the updated Bookings row. Cal.com is the owner:
  it applies the change and then sends a webhook, and that webhook is what
  updates the mirror. Returning a row here would mean writing it from two code
  paths with no guarantee they agree.
  """
  type CalcomWriteResult {
    ok: Boolean
    uid: String
  }

  input CalcomAttendeeAbsenceInput {
    email: String!
    absent: Boolean!
  }

  input CalcomBookingAttendeeInput {
    name: String!
    email: String!
    timeZone: String
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

  calcomEventTypes(username: String): [CalcomEventType]
  calcomSlots(
    eventTypeId: Int!
    start: String!
    end: String!
    timeZone: String
  ): [CalcomSlot]
`;

/**
 * Write-through to Cal.com, never straight to the mirror.
 *
 * There is still no create/update/remove for the `Bookings` collection itself,
 * for the reason the read-only note used to give: a row written here would
 * drift from Cal.com the moment it was made. These mutations instead ask
 * Cal.com to make the change and let the resulting webhook update the mirror,
 * so the mirror keeps exactly one writer and the UI cannot invent a booking
 * state Cal.com never agreed to.
 */
export const mutations = `
  calcomCancelBooking(uid: String!, cancellationReason: String): CalcomWriteResult
  calcomRescheduleBooking(
    uid: String!
    start: String!
    reschedulingReason: String
  ): CalcomWriteResult
  calcomMarkNoShow(
    uid: String!
    noShowHost: Boolean
    attendees: [CalcomAttendeeAbsenceInput!]
  ): CalcomWriteResult
  calcomCreateBooking(
    eventTypeId: Int!
    start: String!
    attendee: CalcomBookingAttendeeInput!
    customerId: String
  ): CalcomWriteResult
`;
