import { gql, useQuery } from '@apollo/client';
import dayjs from 'dayjs';

import { Spinner } from 'erxes-ui/components/spinner';

import List from '../components/List';
import { queries } from '../../../graphql';

import { StatementQueryResponse } from '../../../types/ITransactions';

type Props = {
  queryParams: {
    _id?: string;
    account?: string;
    startDate?: string;
    endDate?: string;
    type?: string;
  };
  showLatest?: boolean;
  refetch?: () => void;
};

export default function ListContainer({
  queryParams,
  showLatest = false,
}: Props) {
  const { _id: configId, account: accountId } = queryParams;

  // Latest transactions mode (last 24 hours)
  const startDate = showLatest
    ? dayjs().subtract(1, 'day').format('YYYY-MM-DD')
    : queryParams.startDate;
  const endDate = showLatest
    ? dayjs().format('YYYY-MM-DD')
    : queryParams.endDate;

  const { data, loading, error } = useQuery<StatementQueryResponse>(
    gql(queries.statementsQuery),
    {
      variables: {
        configId,
        accountId,
        startDate,
        endDate,
      },
      skip: !configId || !accountId,
      fetchPolicy: 'network-only',
    },
  );

  if (loading) {
    return <Spinner />;
  }

  if (error) {
    return (
      <div className="p-4 text-sm rounded-md bg-destructive/10 text-destructive">
        {error.message}
      </div>
    );
  }

  const statement = data?.golomtBankStatements;

  if (!statement) {
    return null;
  }

  return (
    <List
      queryParams={queryParams}
      showLatest={showLatest}
      loading={false}
      statement={statement}
    />
  );
}
