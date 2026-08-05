import {
  IconCalendarCog,
  IconCalendarEvent,
  IconClock,
  IconUsersGroup,
} from '@tabler/icons-react';
import { NavigationMenuLinkItem } from 'erxes-ui';

/**
 * `path` carries the full plugin-prefixed route (e.g. "calcom/bookings"), not
 * a bare segment — NavigationMenuLinkItem builds its href from `path` alone
 * unless a `pathPrefix` is also given, and nothing here supplies one. Mirrors
 * sales_ui's MainNavigation ("sales/deals", "sales/pos"), which is the same
 * component used the same way. The original single entry read just
 * "bookings", which linked to /bookings instead of /calcom/bookings.
 */
export const CalcomNavigation = () => {
  return (
    <>
      <NavigationMenuLinkItem
        name="Bookings"
        icon={IconCalendarEvent}
        path="calcom/bookings"
      />
      <NavigationMenuLinkItem
        name="Event types"
        icon={IconCalendarCog}
        path="calcom/event-types"
      />
      <NavigationMenuLinkItem
        name="Schedules"
        icon={IconClock}
        path="calcom/schedules"
      />
      <NavigationMenuLinkItem
        name="Teams"
        icon={IconUsersGroup}
        path="calcom/teams"
      />
    </>
  );
};
