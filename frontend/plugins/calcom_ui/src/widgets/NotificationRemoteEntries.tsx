import { IconCalendarEvent, IconInfoCircle } from '@tabler/icons-react';
import { Button } from 'erxes-ui';
import { Link } from 'react-router-dom';
import type { TNotification } from 'ui-modules';

/**
 * Notification detail views for this plugin.
 *
 * Required, not optional. core-api's onboarding routine emits a
 * `<plugin>:system.welcome` notification for EVERY enabled plugin
 * (core-api/src/modules/notifications/utils.ts), and core-ui renders the detail
 * of any non-core notification by loading `<plugin>_ui/notificationWidget`
 * (NotificationContent.tsx). A plugin that does not expose that remote gets
 *
 *   Module unavailable — calcom_ui/notificationWidget — failed to load
 *
 * as soon as anyone opens its welcome message. Nothing in the plugin declares
 * the notification, so there is no obvious place to discover the requirement
 * from — which is why it was missed.
 */

const WelcomeContent = () => (
  <div className="flex min-h-screen items-center justify-center p-6">
    <div className="flex max-w-md flex-col items-center text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <IconCalendarEvent className="size-6" />
      </div>

      <h3 className="text-lg font-semibold">Cal.com bookings, in your CRM</h3>

      <p className="mt-2 text-sm text-muted-foreground">
        Every booking made in Cal.com is mirrored here and linked to the contact
        who booked it. Cancel, reschedule or book a time without leaving the CRM.
      </p>

      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link to="/calcom/bookings">View bookings</Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link to="/settings/calcom/bookings">Set up the connection</Link>
        </Button>
      </div>
    </div>
  </div>
);

const NotificationContentUnavailable = () => (
  <div className="flex min-h-screen items-center justify-center p-6">
    <div className="flex max-w-sm flex-col items-center text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent text-muted-foreground">
        <IconInfoCircle className="size-5" />
      </div>
      <h3 className="text-base font-medium">Nothing more to show</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        This notification has no detail view.
      </p>
    </div>
  </div>
);

/**
 * Routes on contentType, which core formats as `<plugin>:<module>.<type>` —
 * so `calcom:system.welcome` splits to module 'system', type 'welcome'.
 */
const NotificationRemoteEntries = (props: TNotification) => {
  const { contentType } = props;

  const [, moduleName, type] = (contentType || '')
    .replace(':', '.')
    .split('.');

  if (moduleName === 'system' && type === 'welcome') {
    return <WelcomeContent />;
  }

  // Anything else gets a real explanation rather than a blank pane. Booking
  // events reach people through automations and the bookings list, so there is
  // deliberately no per-booking notification detail to render here.
  return <NotificationContentUnavailable />;
};

export default NotificationRemoteEntries;
