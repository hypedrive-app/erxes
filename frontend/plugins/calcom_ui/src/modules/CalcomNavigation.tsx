
  import { NavigationMenuLinkItem } from 'erxes-ui';
  import { IconSandbox } from '@tabler/icons-react';

export const CalcomNavigation = () => {
  return (
    <>
     <NavigationMenuLinkItem
        name="bookings"
        icon={IconSandbox}
        path="bookings"
      />
    </>
  );
};
