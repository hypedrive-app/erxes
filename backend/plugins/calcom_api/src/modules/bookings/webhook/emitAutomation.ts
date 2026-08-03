import { sendAutomationTrigger } from 'erxes-api-shared/core-modules';

import { IBookings } from '@/bookings/@types/bookings';

import { HandledTrigger } from './mapPayload';

/**
 * Maps a Cal.com webhook event onto the automation trigger type an erxes rule
 * subscribes to.
 *
 * BOOKING_REQUESTED was originally left out on the grounds that "an approval
 * that has not been decided yet is not an outcome to act on". That was
 * backwards: a booking waiting on approval is exactly the thing that needs to
 * reach a human, and it is the only event here with a deadline attached — the
 * requester is waiting. Now that confirm/decline exist as actions, a rule can
 * both notify and resolve it.
 *
 * BOOKING_REJECTED stays mapped to the cancelled trigger rather than getting
 * its own: from the CRM's point of view the meeting is not happening, which is
 * the same fact a rule acts on, and the payload carries the distinction for
 * anything that needs it.
 */
const TRIGGER_TYPE_BY_EVENT: Partial<Record<HandledTrigger, string>> = {
  BOOKING_CREATED: 'calcom:bookings.created',
  BOOKING_REQUESTED: 'calcom:bookings.requested',
  BOOKING_REJECTED: 'calcom:bookings.cancelled',
  BOOKING_RESCHEDULED: 'calcom:bookings.rescheduled',
  BOOKING_CANCELLED: 'calcom:bookings.cancelled',
  BOOKING_NO_SHOW_UPDATED: 'calcom:bookings.noShow',
  BOOKING_PAID: 'calcom:bookings.paid',
  MEETING_ENDED: 'calcom:bookings.meetingEnded',
};

/**
 * Flattens the stored booking into the shape a rule's conditions read.
 *
 * The first attendee is promoted to customerId/attendeeEmail/attendeeName
 * because that is what a rule almost always targets — "tag the customer who
 * booked". The full attendee array stays available for anything more involved.
 */
const toAutomationTarget = (booking: Partial<IBookings>) => {
  const attendee = booking.attendees?.[0];

  return {
    ...booking,
    customerId: attendee?.erxesCustomerId,
    attendeeEmail: attendee?.email,
    attendeeName: attendee?.name,
  };
};

export const emitBookingAutomation = (
  subdomain: string,
  event: HandledTrigger,
  booking: Partial<IBookings>,
): void => {
  const type = TRIGGER_TYPE_BY_EVENT[event];

  if (!type) return;

  try {
    // Not awaited, matching how sales_api emits from its order flow: the
    // automation run is downstream work, and the webhook has already been
    // acknowledged by the time a rule finishes.
    sendAutomationTrigger(subdomain, {
      type,
      targets: [toAutomationTarget(booking)],
    });
  } catch (e) {
    // An automation that fails to start must not fail the delivery — the
    // booking is stored either way.
    console.error(`calcom: could not emit ${type}`, e);
  }
};
