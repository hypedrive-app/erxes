import { SettingsNavigationMenuLinkItem, Sidebar } from 'erxes-ui';

/**
 * The generator substituted the module name into every slot, so this read
 * "bookings / bookings / bookings" and — worse — set pathPrefix to
 * "calcom/bookings". SettingsNavigationMenuLinkItem prepends "settings/" and
 * then appends `path`, so that produced settings/calcom/bookings/bookings: a
 * link to a route that does not exist. The prefix is the plugin name alone,
 * matching payment_ui and the other plugins.
 *
 * Only one entry here, not one per management page: event types, schedules
 * and teams are content to manage, with their own pages under the main
 * Cal.com nav (see CalcomNavigation) — same distinction payment_ui draws
 * between its settings pages (methods, invoices) and sales_ui's deals list.
 * This is the integration's connection settings only.
 */
export const CalcomSettingsNavigation = () => {
  return (
    <Sidebar.Group>
      <Sidebar.GroupLabel className="h-4">Cal.com</Sidebar.GroupLabel>
      <Sidebar.GroupContent className="pt-1">
        <Sidebar.Menu>
          <SettingsNavigationMenuLinkItem
            pathPrefix="calcom"
            path="bookings"
            name="Bookings"
          />
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
};
