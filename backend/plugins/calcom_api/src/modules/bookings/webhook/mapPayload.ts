import { IBookingAttendee, IBookings } from '@/bookings/@types/bookings';

/**
 * The envelope Cal.com POSTs. From its sendPayload.ts:
 *
 *   type WebhookDataType = WebhookPayloadType & { triggerEvent: string; createdAt: string }
 *   body = JSON.stringify({ triggerEvent, createdAt, payload: data })
 */
export type CalcomWebhookBody = {
  triggerEvent?: string;
  createdAt?: string;
  payload?: Record<string, any>;
};

/** The events this plugin acts on. Anything else is acknowledged and ignored. */
export const HANDLED_TRIGGERS = [
  'BOOKING_CREATED',
  'BOOKING_REQUESTED',
  'BOOKING_RESCHEDULED',
  'BOOKING_CANCELLED',
  'BOOKING_REJECTED',
  'BOOKING_PAID',
  'BOOKING_NO_SHOW_UPDATED',
  'MEETING_ENDED',
] as const;

export type HandledTrigger = (typeof HANDLED_TRIGGERS)[number];

export const isHandledTrigger = (value?: string): value is HandledTrigger =>
  !!value && (HANDLED_TRIGGERS as readonly string[]).includes(value);

const toDate = (value: unknown): Date | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * Cal.com sends the meeting link in different places depending on the location
 * type: a Cal Video booking puts it on `videoCallData.url`, an integration puts
 * it in `location`, and some carry a bare `meetingUrl`. Checked in that order.
 */
const readMeetingUrl = (payload: Record<string, any>): string | undefined =>
  payload.videoCallData?.url ??
  payload.meetingUrl ??
  (typeof payload.location === 'string' && payload.location.startsWith('http')
    ? payload.location
    : undefined);

const readAttendees = (payload: Record<string, any>): IBookingAttendee[] => {
  const raw = Array.isArray(payload.attendees) ? payload.attendees : [];

  return raw
    .map((a: Record<string, any>) => ({
      email: a?.email,
      name: a?.name,
      timeZone: a?.timeZone,
    }))
    .filter((a: IBookingAttendee) => !!a.email);
};

/**
 * Turns one webhook delivery into the fields to persist.
 *
 * Only what the payload actually contains is returned — the caller merges this
 * onto the existing row, so an absent key must mean "unchanged", not "cleared".
 * That is why this builds the object incrementally instead of returning a fully
 * populated record with undefined holes: `$set` with an explicit undefined
 * would wipe a value an earlier event had legitimately set.
 */
export const mapPayloadToBooking = (
  body: CalcomWebhookBody,
): (Partial<IBookings> & { uid: string }) | null => {
  const payload = body.payload;
  if (!payload) return null;

  // `uid` is the only field this mirror cannot work without: it is the
  // idempotency key and the join key for every later event on the same booking.
  const uid = payload.uid;
  if (typeof uid !== 'string' || !uid) return null;

  const mapped: Partial<IBookings> & { uid: string } = { uid };

  const set = <K extends keyof IBookings>(key: K, value: IBookings[K]) => {
    if (value !== undefined && value !== null && value !== '') {
      mapped[key] = value;
    }
  };

  set('bookingId', payload.bookingId);
  set('title', payload.title);
  set('description', payload.description ?? payload.additionalNotes);
  set('status', payload.status);

  set('startTime', toDate(payload.startTime));
  set('endTime', toDate(payload.endTime));

  set('eventTypeId', payload.eventTypeId);
  set('eventTypeSlug', payload.eventType?.slug ?? payload.eventTypeSlug);

  set('organizerEmail', payload.organizer?.email);
  set('organizerName', payload.organizer?.name);

  const attendees = readAttendees(payload);
  if (attendees.length) mapped.attendees = attendees;

  set(
    'location',
    typeof payload.location === 'string' ? payload.location : undefined,
  );
  set('meetingUrl', readMeetingUrl(payload));

  // Cal.com names the previous booking's uid differently across versions;
  // rescheduleUid is the documented one, rescheduledFromUid appears on some.
  set(
    'rescheduledFromUid',
    payload.rescheduleUid ?? payload.rescheduledFromUid,
  );
  set('cancelledBy', payload.cancelledBy);
  set('cancellationReason', payload.cancellationReason);

  set('paymentStatus', payload.paymentStatus ?? payload.paymentData?.status);

  // Explicit typeof check, not a truthiness one: `false` is a meaningful value
  // here and must be stored, while absent must stay absent.
  if (typeof payload.noShowHost === 'boolean') {
    mapped.noShowHost = payload.noShowHost;
  }

  set('lastTriggerEvent', body.triggerEvent);
  set('lastPayloadAt', toDate(body.createdAt));

  mapped.rawPayload = payload;

  return mapped;
};
