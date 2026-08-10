
  import { NavigationMenuLinkItem } from 'erxes-ui';
  import { IconSandbox } from '@tabler/icons-react';

export const EnrichmentNavigation = () => {
  return (
    <>
     <NavigationMenuLinkItem
        name="providers"
        icon={IconSandbox}
        path="providers"
      />
    </>
  );
};
