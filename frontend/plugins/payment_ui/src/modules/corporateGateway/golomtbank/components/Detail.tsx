import * as React from 'react';
import { useQueryState } from 'erxes-ui/hooks/use-query-state';
import { Tabs } from 'erxes-ui/components/tabs';

import DetailContainer from '../corporateGateway/accounts/containers/Detail';
import TransactionsContainer from '../corporateGateway/transactions/containers/List';

const Detail = () => {
  const [accountId] = useQueryState<string>('account');
  const [configId] = useQueryState<string>('_id');

  if (!accountId) {
    return <>please select corporate gateway</>;
  }

  // Both tabs read the selected gateway from the URL, written by the account
  // sidebar rows (see corporateGateway/accounts/components/Row).
  const queryParams = { _id: configId ?? undefined, account: accountId };

  return (
    <Tabs defaultValue="account" className="w-full">
      <Tabs.List>
        <Tabs.Trigger value="account">{'account'}</Tabs.Trigger>
        <Tabs.Trigger value="transactions">{'transactions'}</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="account">
        <div className="p-4">
          <DetailContainer queryParams={queryParams} />
        </div>
      </Tabs.Content>

      <Tabs.Content value="transactions">
        <div className="p-4">
          <TransactionsContainer queryParams={queryParams} />
        </div>
      </Tabs.Content>
    </Tabs>
  );
};

export default Detail;
