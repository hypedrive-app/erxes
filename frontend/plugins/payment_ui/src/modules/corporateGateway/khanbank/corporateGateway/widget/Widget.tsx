import { Button } from 'erxes-ui';
import { Popover } from 'erxes-ui/components/popover';
import { IconCurrencyDollar } from '@tabler/icons-react';

import RateList from '../containers/Rates';

const Widget = () => {
  return (
    <Popover>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <IconCurrencyDollar size={18} />
        </Button>
      </Popover.Trigger>

      <Popover.Content align="end" className="w-80 p-4">
        <RateList />
      </Popover.Content>
    </Popover>
  );
};

export default Widget;
