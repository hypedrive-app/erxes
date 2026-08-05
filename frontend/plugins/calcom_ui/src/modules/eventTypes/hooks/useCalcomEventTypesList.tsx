import { useQuery } from '@apollo/client';

import { CALCOM_EVENT_TYPES_QUERY } from '~/modules/eventTypes/graphql/eventTypes';
import { ICalcomEventTypeListItem } from '~/modules/eventTypes/types/eventType';

/**
 * Event types are Cal.com configuration with no webhook of their own, so this
 * is a live read every time — no mirror to go stale. `cache-and-network`
 * still shows the last list immediately rather than a blank page on revisit.
 */
export const useCalcomEventTypesList = () => {
  const { data, loading, error, refetch } = useQuery<{
    calcomEventTypes: ICalcomEventTypeListItem[];
  }>(CALCOM_EVENT_TYPES_QUERY, {
    fetchPolicy: 'cache-and-network',
  });

  return {
    eventTypes: data?.calcomEventTypes ?? [],
    loading,
    error,
    refetch,
  };
};
