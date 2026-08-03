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

  """
  Whether an integration setting is configured, and where it came from.

  Deliberately carries no value. A live API key and a webhook signing secret
  would otherwise sit in a GraphQL response that anyone with settings access
  could read out of the network tab; knowing a key is present is enough to
  diagnose the integration.

  The source field distinguishes a value set in the UI from one baked into the
  deployment — the difference between "changeable here" and "needs a deploy".
  """
  type CalcomConfigStatus {
    code: String
    isSet: Boolean
    source: String
  }

  """
  A Cal Video recording. Only Cal Video produces these — a Google Meet or Zoom
  booking simply has none, which is an empty list rather than an error.
  """
  type CalcomRecording {
    id: String
    status: String
    duration: Float
    downloadLink: String
    shareToken: String
  }

  """An "add to calendar" link for one calendar provider."""
  type CalcomCalendarLink {
    label: String
    link: String
  }

  """
  What this booking actually created in an external calendar or conferencing
  tool. Diagnostic: when a booking exists in Cal.com but nobody sees it in
  their calendar, this says whether the write succeeded.
  """
  type CalcomBookingReference {
    id: Int
    type: String
    uid: String
    meetingUrl: String
    externalCalendarId: String
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

  """
  Which integration settings are configured. Values are never returned — see
  CalcomConfigStatus.
  """
  calcomConfigStatus: [CalcomConfigStatus]

  """
  Cal Video recordings and transcripts. Empty for bookings held on any other
  conferencing provider.
  """
  calcomBookingRecordings(uid: String!): [CalcomRecording]
  calcomBookingTranscripts(uid: String!): [String]

  """Add-to-calendar links for a booking."""
  calcomBookingCalendarLinks(uid: String!): [CalcomCalendarLink]

  """External calendar/conferencing records this booking created."""
  calcomBookingReferences(uid: String!): [CalcomBookingReference]

  """
  Resolves a seated booking by SEAT uid. Seated event types give each attendee
  their own seat reference, and that is the only identifier the attendee sees.
  """
  calcomBookingBySeat(seatUid: String!): Bookings

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

  """
  Approve or refuse a booking that is awaiting confirmation. Event types with
  requiresConfirmation create bookings in PENDING; these are how that decision
  is made from inside erxes.
  """
  calcomConfirmBooking(uid: String!): CalcomWriteResult
  calcomDeclineBooking(uid: String!, reason: String): CalcomWriteResult

  """
  Stores one integration setting, or clears it when value is omitted.

  Cleared settings fall back to the deployment environment rather than
  disabling the integration, which is why this deletes the row instead of
  storing a blank.
  """
  calcomSetConfig(code: String!, value: String): CalcomConfigStatus

  """
  Moves the meeting to a different location WITHOUT moving it in time.

  Distinct from a reschedule, which cancels the booking and issues a new uid —
  changing "Google Meet" to "phone call" should not do that. The location is a
  JSON object because Cal.com accepts a union of location shapes and validates
  it against the event type's own configured locations.
  """
  calcomUpdateBookingLocation(uid: String!, location: JSON!): CalcomWriteResult

  """
  Reassigns a round-robin booking. Omit userId to let Cal.com pick the next
  host; pass one to choose. Only meaningful for team round-robin event types.
  """
  calcomReassignBooking(
    uid: String!
    userId: Int
    reason: String
  ): CalcomWriteResult
`;
