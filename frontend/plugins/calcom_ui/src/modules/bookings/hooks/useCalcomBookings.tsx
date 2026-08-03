import { useQuery } from '@apollo/client';
import { useCallback } from 'react';

import { CALCOM_BOOKINGS_QUERY } from '~/modules/bookings/graphql/queries/bookings';
import { ICalcomBookingsListResponse } from '~/modules/bookings/types/booking';

export const CALCOM_BOOKINGS_PER_PAGE = 30;

interface UseCalcomBookingsOptions {
  customerId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  perPage?: number;
  skip?: boolean;
}

/**
 * Reads the booking mirror.
 *
 * The backend paginates by page/perPage rather than cursors, so fetchMore has
 * to merge the pages itself — the default Apollo behaviour would replace the
 * previous result with the new page and the list would appear to jump rather
 * than grow.
 */
export const useCalcomBookings = ({
  customerId,
  status,
  startDate,
  endDate,
  perPage = CALCOM_BOOKINGS_PER_PAGE,
  skip,
}: UseCalcomBookingsOptions = {}) => {
  const { data, loading, error, fetchMore } = useQuery<{
    calcomBookings: ICalcomBookingsListResponse;
  }>(CALCOM_BOOKINGS_QUERY, {
    variables: { customerId, status, startDate, endDate, page: 1, perPage },
    skip,
    // The mirror changes underneath us whenever a webhook lands, so a revisit
    // shows the cached page immediately and corrects it from the network.
    fetchPolicy: 'cache-and-network',
    notifyOnNetworkStatusChange: true,
  });

  const bookings = data?.calcomBookings?.list ?? [];
  const totalCount = data?.calcomBookings?.totalCount ?? 0;

  const handleFetchMore = useCallback(() => {
    if (bookings.length >= totalCount) return;

    fetchMore({
      variables: {
        // Derived from what is already loaded rather than an incrementing page
        // counter: with a page counter, a booking arriving between two fetches
        // shifts every row down one and the next page would repeat a row.
        page: Math.floor(bookings.length / perPage) + 1,
        perPage,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult?.calcomBookings) return prev;

        const previous = prev.calcomBookings?.list ?? [];
        const incoming = fetchMoreResult.calcomBookings.list ?? [];

        // Deduplicated on _id. Server-side paging over a collection that is
        // still receiving writes can hand back a row we already hold, and a
        // duplicate key would break React's reconciliation of the table.
        const seen = new Set(previous.map((booking) => booking._id));

        return {
          calcomBookings: {
            ...fetchMoreResult.calcomBookings,
            list: [
              ...previous,
              ...incoming.filter((booking) => !seen.has(booking._id)),
            ],
          },
        };
      },
    });
  }, [bookings.length, totalCount, perPage, fetchMore]);

  return {
    bookings,
    totalCount,
    loading,
    error,
    handleFetchMore,
    hasMore: bookings.length < totalCount,
  };
};
