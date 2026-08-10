
import { SettingsNavigationMenuLinkItem, Sidebar } from 'erxes-ui';

export const EnrichmentSettingsNavigation = () => {
  return (
    <Sidebar.Group>
      <Sidebar.GroupLabel className="h-4">providers</Sidebar.GroupLabel>
      <Sidebar.GroupContent className="pt-1">
        <Sidebar.Menu>
          <SettingsNavigationMenuLinkItem
            pathPrefix={"enrichment" + '/' + "providers"}
            path="providers"
            name="providers"
          />
          
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
};
