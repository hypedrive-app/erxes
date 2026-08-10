import { IconSparkles } from '@tabler/icons-react';
import { NavigationMenuLinkItem } from 'erxes-ui';

/**
 * `name` is what the sidebar renders, so it is the user-facing label rather
 * than the module's technical name — the generator substitutes the latter into
 * both slots and left this reading "providers".
 */
export const EnrichmentNavigation = () => {
  return (
    <NavigationMenuLinkItem
      name="Providers"
      icon={IconSparkles}
      path="providers"
    />
  );
};
