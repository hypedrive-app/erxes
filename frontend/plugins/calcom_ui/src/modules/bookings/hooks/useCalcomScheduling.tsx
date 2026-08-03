import { useQuery } from '@apollo/client';

import {
  CALCOM_EVENT_TYPES_QUERY,
  CALCOM_SLOTS_QUERY,
} from '~/modules/bookings/graphql/queries/scheduling';

export interface ICalcomEventType {
  id: number;
  title?: string;
  slug?: string;
  length?: number;
  description?: string;
  hidden?: boolean;
}

export interface ICalcomSlot {
  start: string;
  end?: string;
}

/**
 * Bookable event types.
 *
 * Hidden types are filtered out: Cal.com returns them so an owner can manage
 * them, but a hidden type is one the owner has taken off their booking page,
 * and offering it here would let erxes book something Cal.com deliberately
 * stopped offering.
 */
export const useCalcomEventTypes = ({
  username,
  skip,
}: { username?: string; skip?: boolean } = {}) => {
  const { data, loading, error } = useQuery<{
    calcomEventTypes: ICalcomEventType[];
  }>(CALCOM_EVENT_TYPES_QUERY, {
    variables: { username },
    skip,
  });

  return {
    eventTypes: (data?.calcomEventTypes ?? []).filter((type) => !type.hidden),
    loading,
    error,
  };
};

/**
 * Free slots for an event type over a date range.
 *
 * network-only, deliberately. Availability is the one thing here that another
 * person can invalidate at any moment by booking it, so a cached slot list is
 * actively misleading — it would offer a time that is already taken and the
 * booking would fail at submit.
 */
export const useCalcomSlots = ({
  eventTypeId,
  start,
  end,
  timeZone,
  skip,
}: {
  eventTypeId?: number;
  start?: string;
  end?: string;
  timeZone?: string;
  skip?: boolean;
}) => {
  const { data, loading, error, refetch } = useQuery<{
    calcomSlots: ICalcomSlot[];
  }>(CALCOM_SLOTS_QUERY, {
    variables: { eventTypeId, start, end, timeZone },
    // Every argument is required by the resolver; firing without them would be
    // a guaranteed error rather than an empty result.
    skip: skip || !eventTypeId || !start || !end,
    fetchPolicy: 'network-only',
  });

  return {
    slots: data?.calcomSlots ?? [],
    loading,
    error,
    refetch,
  };
};
