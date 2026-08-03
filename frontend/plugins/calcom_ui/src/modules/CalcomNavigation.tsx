import { IconCalendarEvent } from '@tabler/icons-react';
import { NavigationMenuLinkItem } from 'erxes-ui';

/**
 * Main navigation entry.
 *
 * IconSandbox and the lowercase label were generator placeholders — the sandbox
 * icon is what create-plugin emits for every plugin regardless of what it does.
 */
export const CalcomNavigation = () => {
  return (
    <NavigationMenuLinkItem
      name="Bookings"
      icon={IconCalendarEvent}
      path="bookings"
    />
  );
};
