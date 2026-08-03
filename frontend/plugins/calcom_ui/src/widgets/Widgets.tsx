import { IRelationWidgetProps } from 'ui-modules';

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
 * On a contact page the two coincide; falling back to contentId for the
 * customer content types keeps it working if the host omits customerId.
 */
const CUSTOMER_CONTENT_TYPES = ['customer', 'contacts:customer', 'lead'];

export const Widgets = (props: IRelationWidgetProps) => {
  const { contentId, contentType, customerId } = props;

  const resolvedCustomerId =
    customerId ||
    (CUSTOMER_CONTENT_TYPES.includes(contentType) ? contentId : undefined);

  // Renders nothing rather than an empty state: with no customer there is no
  // question to ask, and an empty panel would read as "no bookings" when the
  // truth is "not applicable here".
  if (!resolvedCustomerId) {
    return null;
  }

  return <CustomerBookingsWidget customerId={resolvedCustomerId} />;
};

export default Widgets;
