import {
  AutomationConstants,
  TAutomationRuntimeOutputDefinition,
} from 'erxes-api-shared/core-modules';

/**
 * Automation surface for Cal.com bookings.
 *
 * The triggers are deliberately NOT `isCustom`. A custom trigger obliges the
 * plugin to implement checkCustomTrigger, and when that handler is missing the
 * automation does not error — it reports "completed successfully" and enrols
 * nobody. Plain event triggers are matched by core, so a booking event either
 * fires or is visibly absent.
 */

const BOOKING_OUTPUT: TAutomationRuntimeOutputDefinition = {
  variables: [
    { key: 'uid', label: 'Booking uid' },
    { key: 'title', label: 'Title' },
    { key: 'status', label: 'Status' },
    { key: 'startTime', label: 'Start time' },
    { key: 'endTime', label: 'End time' },
    { key: 'eventTypeSlug', label: 'Event type' },
    { key: 'organizerEmail', label: 'Organizer email' },
    { key: 'organizerName', label: 'Organizer name' },
    { key: 'meetingUrl', label: 'Meeting URL' },
    { key: 'location', label: 'Location' },
    { key: 'cancellationReason', label: 'Cancellation reason' },
    { key: 'cancelledBy', label: 'Cancelled by' },
    { key: 'paymentStatus', label: 'Payment status' },
    { key: 'noShowHost', label: 'Host no-show' },
    // The first attendee's resolved contact, flattened by emitAutomation.
    // Exposed by name because it is what a rule almost always targets:
    // "tag the customer who booked".
    { key: 'customerId', label: 'Customer id' },
    { key: 'attendeeEmail', label: 'Attendee email' },
    { key: 'attendeeName', label: 'Attendee name' },
  ],
};

export const calcomAutomationConstants: AutomationConstants = {
  triggers: [
    {
      moduleName: 'bookings',
      collectionName: 'bookings',
      relationType: 'event',
      icon: 'IconCalendarPlus',
      label: 'Cal.com booking created',
      description: 'Start this workflow when a Cal.com booking is created.',
      type: 'calcom:bookings.created',
      output: BOOKING_OUTPUT,
    },
    {
      moduleName: 'bookings',
      collectionName: 'bookings',
      relationType: 'event',
      icon: 'IconClockQuestion',
      label: 'Cal.com booking requested',
      description:
        'Start this workflow when a booking needs approval. Pair it with the cancel action, or notify whoever decides.',
      type: 'calcom:bookings.requested',
      output: BOOKING_OUTPUT,
    },
    {
      moduleName: 'bookings',
      collectionName: 'bookings',
      relationType: 'event',
      icon: 'IconCalendarEvent',
      label: 'Cal.com booking rescheduled',
      description: 'Start this workflow when a Cal.com booking is rescheduled.',
      type: 'calcom:bookings.rescheduled',
      output: BOOKING_OUTPUT,
    },
    {
      moduleName: 'bookings',
      collectionName: 'bookings',
      relationType: 'event',
      icon: 'IconCalendarX',
      label: 'Cal.com booking cancelled',
      description: 'Start this workflow when a Cal.com booking is cancelled.',
      type: 'calcom:bookings.cancelled',
      output: BOOKING_OUTPUT,
    },
    {
      moduleName: 'bookings',
      collectionName: 'bookings',
      relationType: 'event',
      icon: 'IconUserX',
      label: 'Cal.com booking no-show',
      description:
        'Start this workflow when Cal.com reports a no-show for a booking.',
      type: 'calcom:bookings.noShow',
      output: BOOKING_OUTPUT,
    },
    {
      moduleName: 'bookings',
      collectionName: 'bookings',
      relationType: 'event',
      icon: 'IconCreditCard',
      label: 'Cal.com booking paid',
      description: 'Start this workflow when a Cal.com booking is paid for.',
      type: 'calcom:bookings.paid',
      output: BOOKING_OUTPUT,
    },
    {
      moduleName: 'bookings',
      collectionName: 'bookings',
      relationType: 'event',
      icon: 'IconCalendarCheck',
      label: 'Cal.com meeting ended',
      description: 'Start this workflow when a Cal.com meeting has ended.',
      type: 'calcom:bookings.meetingEnded',
      output: BOOKING_OUTPUT,
    },
  ],
  actions: [
    {
      moduleName: 'bookings',
      collectionName: 'bookings',
      // No `method`: that field is typed 'create' only, and this action is not
      // a record creation. The action is identified by `type`, which is what
      // receiveActions dispatches on.
      icon: 'IconCalendarX',
      label: 'Cancel Cal.com booking',
      description:
        'Cancel the booking in Cal.com. The resulting BOOKING_CANCELLED webhook is what updates the mirror.',
      type: 'calcom:bookings.cancel',
    },
  ],
  findObjectTargets: [],
  setPropertyTargets: [],
};
