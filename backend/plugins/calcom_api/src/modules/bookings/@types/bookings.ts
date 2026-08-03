import { Document } from 'mongoose';

export interface IBookingAttendee {
  email?: string;
  name?: string;
  timeZone?: string;
  erxesCustomerId?: string;
}

/**
 * Mirrors bookingsSchema. Everything except `uid` is optional because the
 * source of every field is a Cal.com webhook payload, and Cal.com omits fields
 * that do not apply to the event being reported — a cancellation carries no
 * payment status, a fresh booking carries no rescheduledFromUid. Declaring them
 * required would only push the lie one layer up.
 */
export interface IBookings {
  uid: string;
  bookingId?: number;

  title?: string;
  description?: string;
  status?: string;

  startTime?: Date;
  endTime?: Date;

  eventTypeId?: number;
  eventTypeSlug?: string;

  organizerEmail?: string;
  organizerName?: string;

  attendees?: IBookingAttendee[];

  location?: string;
  meetingUrl?: string;

  rescheduledFromUid?: string;
  cancelledBy?: string;
  cancellationReason?: string;

  paymentStatus?: string;

  // Tri-state: undefined means Cal.com never reported on it, which is not the
  // same as "showed up".
  noShowHost?: boolean;

  lastTriggerEvent?: string;
  lastPayloadAt?: Date;

  rawPayload?: Record<string, any>;
}

export interface IBookingsDocument extends IBookings, Document {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}
