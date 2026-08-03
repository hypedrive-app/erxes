
import { SettingsNavigationMenuLinkItem, Sidebar } from 'erxes-ui';

export const CalcomSettingsNavigation = () => {
  return (
    <Sidebar.Group>
      <Sidebar.GroupLabel className="h-4">bookings</Sidebar.GroupLabel>
      <Sidebar.GroupContent className="pt-1">
        <Sidebar.Menu>
          <SettingsNavigationMenuLinkItem
            pathPrefix={"calcom" + '/' + "bookings"}
            path="bookings"
            name="bookings"
          />
          
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
};
