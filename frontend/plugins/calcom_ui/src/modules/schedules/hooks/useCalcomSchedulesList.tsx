import { useQuery } from '@apollo/client';

import { CALCOM_SCHEDULES_QUERY } from '~/modules/schedules/graphql/schedules';
import { ICalcomSchedule } from '~/modules/schedules/types/schedule';

export const useCalcomSchedulesList = () => {
  const { data, loading, error } = useQuery<{
    calcomSchedules: ICalcomSchedule[];
  }>(CALCOM_SCHEDULES_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  return {
    schedules: data?.calcomSchedules ?? [],
    loading,
    error,
  };
};
