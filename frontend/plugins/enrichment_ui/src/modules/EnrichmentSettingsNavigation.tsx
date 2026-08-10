import { SettingsNavigationMenuLinkItem, Sidebar } from 'erxes-ui';

/**
 * The generator substitutes the module name into every slot, which produced
 * "providers / providers / providers" and a pathPrefix of
 * "enrichment/providers". SettingsNavigationMenuLinkItem prepends "settings/"
 * and then appends `path`, so that resolved to
 * settings/enrichment/providers/providers — a route that does not exist.
 * The prefix is the plugin name alone, as in calcom_ui and payment_ui.
 *
 * One entry, not one per provider: there is a single screen holding all four
 * API keys, because they are one integration's credentials rather than four
 * separate things to manage.
 */
export const EnrichmentSettingsNavigation = () => {
  return (
    <Sidebar.Group>
      <Sidebar.GroupLabel className="h-4">Enrichment</Sidebar.GroupLabel>
      <Sidebar.GroupContent className="pt-1">
        <Sidebar.Menu>
          <SettingsNavigationMenuLinkItem
            pathPrefix="enrichment"
            path="providers"
            name="Providers"
          />
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  );
};
