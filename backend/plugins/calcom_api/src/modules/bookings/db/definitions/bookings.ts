import { Schema } from 'mongoose';

import { mongooseStringRandomId } from 'erxes-api-shared/utils';

/**
 * A mirror of a Cal.com booking.
 *
 * Cal.com stays the source of truth: rows here are written by the webhook and
 * never pushed back, so a field Cal.com does not send is left absent rather
 * than defaulted to something that would read as fact.
 *
 * Field names follow Cal.com's EventPayloadType (its
 * packages/features/webhooks/lib/sendPayload.ts) so the mapping stays legible;
 * `erxes*` fields are ours.
 */

const attendeeSchema = new Schema(
  {
    email: { type: String, label: 'Email' },
    name: { type: String, label: 'Name' },
    timeZone: { type: String, label: 'Time zone' },
    // Set when this attendee was matched to (or created as) an erxes customer.
    // Absent means the match has not run or found nothing — deliberately not
    // defaulted, so "not yet linked" and "linked to nothing" stay distinct.
    erxesCustomerId: { type: String, label: 'erxes customer', optional: true },
  },
  { _id: false },
);

export const bookingsSchema = new Schema(
  {
    _id: mongooseStringRandomId,

    // Cal.com's own identifiers. `uid` is the stable public one that appears in
    // booking URLs and in every webhook; `bookingId` is its numeric primary key.
    // The unique index on uid is what makes webhook delivery idempotent —
    // Cal.com retries, and without it a retry would insert a second row.
    uid: { type: String, label: 'Cal.com uid', unique: true, sparse: true },
    bookingId: { type: Number, label: 'Cal.com booking id', optional: true },

    title: { type: String, label: 'Title' },
    description: { type: String, label: 'Description', optional: true },
    status: { type: String, label: 'Status', index: true },

    startTime: { type: Date, label: 'Start time', index: true },
    endTime: { type: Date, label: 'End time' },

    eventTypeId: { type: Number, label: 'Event type id', optional: true },
    eventTypeSlug: { type: String, label: 'Event type slug', optional: true },

    organizerEmail: { type: String, label: 'Organizer email', optional: true },
    organizerName: { type: String, label: 'Organizer name', optional: true },

    attendees: { type: [attendeeSchema], label: 'Attendees' },

    location: { type: String, label: 'Location', optional: true },
    meetingUrl: { type: String, label: 'Meeting URL', optional: true },

    // Populated only by the events that carry them, so their presence is itself
    // the signal that a reschedule or cancellation happened.
    rescheduledFromUid: {
      type: String,
      label: 'Rescheduled from',
      optional: true,
    },
    cancelledBy: { type: String, label: 'Cancelled by', optional: true },
    cancellationReason: {
      type: String,
      label: 'Cancellation reason',
      optional: true,
    },

    paymentStatus: { type: String, label: 'Payment status', optional: true },

    // Set by BOOKING_NO_SHOW_UPDATED. Tri-state on purpose: undefined means
    // Cal.com never reported on it, which is not the same as "showed up".
    noShowHost: { type: Boolean, label: 'Host no-show', optional: true },

    // The last webhook that touched this row, and when Cal.com sent it. Kept so
    // an out-of-order delivery can be recognised rather than silently applied.
    lastTriggerEvent: {
      type: String,
      label: 'Last trigger event',
      optional: true,
    },
    lastPayloadAt: { type: Date, label: 'Last payload at', optional: true },

    // The delivery as received. Cal.com's payload carries more than this schema
    // models, and a mirror that discards the original leaves nothing to
    // reconcile against when a mapping turns out to be wrong.
    rawPayload: { type: Object, label: 'Raw payload', optional: true },
  },
  {
    timestamps: true,
  },
);

// Every booking-for-this-contact lookup goes through this — the customer detail
// widget and the automation triggers both.
bookingsSchema.index({ 'attendees.erxesCustomerId': 1, startTime: -1 });
bookingsSchema.index({ 'attendees.email': 1 });
