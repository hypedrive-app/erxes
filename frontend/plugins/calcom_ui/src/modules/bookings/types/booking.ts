/**
 * Mirrors the `Bookings` type in calcom_api's GraphQL schema.
 *
 * Nearly every field is optional because the mirror only stores what a webhook
 * actually carried: Cal.com omits fields that do not apply to an event (there
 * is no cancellationReason on an accepted booking, no meetingUrl on a
 * phone-call event type), and the mapper deliberately writes only the keys
 * present in the payload rather than filling blanks.
 */
export interface ICalcomBookingAttendee {
  email?: string;
  name?: string;
  timeZone?: string;
  erxesCustomerId?: string;
}

export interface ICalcomBooking {
  _id: string;
  uid?: string;
  bookingId?: number;

  title?: string;
  description?: string;
  status?: string;

  startTime?: string;
  endTime?: string;

  eventTypeId?: number;
  eventTypeSlug?: string;

  organizerEmail?: string;
  organizerName?: string;

  attendees?: ICalcomBookingAttendee[];

  location?: string;
  meetingUrl?: string;

  rescheduledFromUid?: string;
  cancelledBy?: string;
  cancellationReason?: string;

  paymentStatus?: string;
  // Tri-state on purpose: undefined means Cal.com never reported on it, which
  // is not the same as it reporting the host showed up.
  noShowHost?: boolean;

  lastTriggerEvent?: string;
  lastPayloadAt?: string;

  createdAt?: string;
  updatedAt?: string;
}

export interface ICalcomBookingsListResponse {
  list: ICalcomBooking[];
  totalCount: number;
}
