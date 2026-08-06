import { IconCalendarOff } from '@tabler/icons-react';
import { IRelationWidgetProps, useCustomerDetail } from 'ui-modules';

import { CustomerBookingsWidget } from '~/modules/bookings/components/CustomerBookingsWidget';

/**
 * Relation-widget host, rendered by core-ui's WidgetsComponent as the
 * `relationWidget` remote.
 *
 * Bookings are linked to people: the webhook handler resolves attendee emails
 * to customers, so `attendees.erxesCustomerId` is the only join that exists.
 * The widget therefore keys off `customerId` — which the host passes
 * explicitly — rather than `contentId`, which is whichever record the panel
 * happens to be open on (a deal, a ticket) and would match nothing.
 *
 * The exception is a contact page, where the contact IS the content, so
 * contentId already holds the customer id. `core:customer` is the literal
 * string the hosts send (CustomerDetail.tsx passes it verbatim) — an earlier
 * version of this file matched against 'customer'/'contacts:customer'/'lead',
 * none of which any host emits, so the tab fell through to `return null` on
 * every surface including the contact page it was written for.
 *
 * This mirrors frontline's call widget, which resolves the same way for the
 * same reason (widgets/relations/modules/call/Calls.tsx).
 */
export const Widgets = (props: IRelationWidgetProps) => {
  const { contentId, contentType, customerId } = props;

  const resolvedCustomerId =
    contentType === 'core:customer' ? customerId || contentId : customerId;

  // Reuses the shared contact hook rather than adding a query: the booking
  // form prefills the attendee from the contact it is being created for, and
  // the host only ever hands over ids.
  const { customerDetail } = useCustomerDetail({
    variables: { _id: resolvedCustomerId },
    skip: !resolvedCustomerId,
  });

  // Tickets and tasks carry no contact link at all — the tab list is global,
  // so this panel opens on them regardless. Saying so is better than the bare
  // `return null` this used to do: a blank panel is indistinguishable from a
  // still-loading one, and on a contact with no bookings it would have read as
  // "broken" rather than "none yet".
  if (!resolvedCustomerId) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center justify-center text-center px-6">
          <IconCalendarOff size={48} className="text-muted-foreground" />
          <h3 className="mt-6 text-lg font-semibold">No contact here</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Bookings are tied to a contact. Open this panel from a contact, a
            deal, or a conversation to see and create their bookings.
          </p>
        </div>
      </div>
    );
  }

  const fullName = [customerDetail?.firstName, customerDetail?.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <CustomerBookingsWidget
      customerId={resolvedCustomerId}
      customerName={fullName || undefined}
      customerEmail={customerDetail?.primaryEmail || undefined}
    />
  );
};

export default Widgets;
