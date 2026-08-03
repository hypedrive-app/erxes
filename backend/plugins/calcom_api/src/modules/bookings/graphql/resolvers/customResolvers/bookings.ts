import { IBookingsDocument } from '@/bookings/@types/bookings';

/**
 * Field resolvers for the Bookings type.
 *
 * The generator left a `description()` here that returned the literal string
 * 'Bookings description'. A field resolver OVERRIDES the stored value, so that
 * stub silently replaced every booking's real description — the note the
 * attendee typed on the booking form — with placeholder text, for every caller.
 * Removed rather than repaired: `description` is a plain stored field and needs
 * no resolver at all.
 *
 * What remains are fields that genuinely cannot be stored, because they are
 * relative to "now" and would be wrong the moment they were written.
 */
export const Bookings = {
  /**
   * Whether the meeting is still ahead.
   *
   * Derived rather than stored: a stored flag would need a cron to recompute it
   * for every booking, and would be wrong in between. Cancelled and rejected
   * bookings are never upcoming — they stay mirrored because the record of the
   * cancellation matters, but there is no meeting to attend.
   */
  isUpcoming(booking: IBookingsDocument) {
    if (!booking.startTime) return false;

    if (booking.status === 'CANCELLED' || booking.status === 'REJECTED') {
      return false;
    }

    return new Date(booking.startTime) > new Date();
  },

  /**
   * Whether the meeting window has passed.
   *
   * Falls back to startTime when endTime is absent — some payloads carry only a
   * start — so this never answers false for a meeting that plainly already
   * happened.
   */
  isPast(booking: IBookingsDocument) {
    const end = booking.endTime || booking.startTime;

    if (!end) return false;

    return new Date(end) < new Date();
  },

  /**
   * Meeting length in minutes, or null when either end is missing.
   *
   * Null rather than 0: zero is a real duration, and reporting it for "we do
   * not know" would be a lie the UI cannot distinguish.
   */
  durationMinutes(booking: IBookingsDocument) {
    if (!booking.startTime || !booking.endTime) return null;

    const ms =
      new Date(booking.endTime).getTime() -
      new Date(booking.startTime).getTime();

    if (!Number.isFinite(ms) || ms < 0) return null;

    return Math.round(ms / 60000);
  },
};
