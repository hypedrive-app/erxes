import { gql, useQuery } from '@apollo/client';

import Detail from '../components/Detail';
import { queries } from '../../../graphql';

import {
  AccountBalanceQueryResponse,
  AccountDetailQueryResponse,
} from '../../../types/IGolomtAccount';

type Props = {
  queryParams: {
    _id?: string;
    account?: string;
  };
};

const DetailContainer = ({ queryParams }: Props) => {
  const { _id: configId, account: accountId } = queryParams;

  const {
    data: detailData,
    loading: detailLoading,
    error: detailError,
  } = useQuery<AccountDetailQueryResponse>(gql(queries.accountDetailQuery), {
    variables: { configId, accountId },
    skip: !configId || !accountId,
    fetchPolicy: 'network-only',
  });

  const { data: balanceData, loading: balanceLoading } =
    useQuery<AccountBalanceQueryResponse>(gql(queries.accountBalanceQuery), {
      variables: { configId, accountId },
      skip: !configId || !accountId,
      fetchPolicy: 'network-only',
    });

  if (detailLoading || balanceLoading) {
    return (
      <div className="flex justify-center py-10">
        <span className="text-sm text-muted-foreground">
          Loading account details...
        </span>
      </div>
    );
  }

  if (detailError) {
    return (
      <div className="p-4 text-sm rounded-md bg-destructive/10 text-destructive">
        {detailError.message}
      </div>
    );
  }

  const account = detailData?.golomtBankAccountDetail;

  if (!account) {
    return (
      <div className="py-10 text-sm text-center text-muted-foreground">
        Account not found
      </div>
    );
  }

  return (
    <Detail
      queryParams={queryParams}
      account={account}
      balances={balanceData?.golomtBankAccountBalance}
      accountId={accountId}
    />
  );
};

export default DetailContainer;
