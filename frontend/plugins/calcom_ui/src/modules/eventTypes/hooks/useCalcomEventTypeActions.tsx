import { useMutation } from '@apollo/client';
import { toast } from 'erxes-ui';
import { useCallback, useState } from 'react';

import {
  CALCOM_CREATE_EVENT_TYPE,
  CALCOM_DELETE_EVENT_TYPE,
  CALCOM_EVENT_TYPES_QUERY,
  CALCOM_UPDATE_EVENT_TYPE,
} from '~/modules/eventTypes/graphql/eventTypes';

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong';

/**
 * Event-type writes go straight to Cal.com and the mutation returns the
 * result directly — unlike bookings, there is no webhook round trip to wait
 * out, so a plain refetch of the list is enough.
 */
export const useCalcomEventTypeActions = () => {
  const [pending, setPending] = useState(false);

  const [createMutation] = useMutation(CALCOM_CREATE_EVENT_TYPE, {
    refetchQueries: [CALCOM_EVENT_TYPES_QUERY],
  });
  const [updateMutation] = useMutation(CALCOM_UPDATE_EVENT_TYPE, {
    refetchQueries: [CALCOM_EVENT_TYPES_QUERY],
  });
  const [deleteMutation] = useMutation(CALCOM_DELETE_EVENT_TYPE, {
    refetchQueries: [CALCOM_EVENT_TYPES_QUERY],
  });

  const run = useCallback(
    async (action: () => Promise<unknown>, success: string) => {
      setPending(true);

      try {
        await action();
        toast({ title: success });
        return true;
      } catch (e) {
        toast({
          title: 'Cal.com rejected the change',
          description: errorMessage(e),
          variant: 'destructive',
        });
        return false;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const createEventType = useCallback(
    (input: {
      title: string;
      slug: string;
      lengthInMinutes: number;
      description?: string;
      hidden?: boolean;
    }) =>
      run(
        () => createMutation({ variables: input }),
        'Event type created in Cal.com',
      ),
    [run, createMutation],
  );

  const updateEventType = useCallback(
    (
      eventTypeId: number,
      input: Partial<{
        title: string;
        slug: string;
        lengthInMinutes: number;
        description: string;
        hidden: boolean;
      }>,
    ) =>
      run(
        () => updateMutation({ variables: { eventTypeId, ...input } }),
        'Event type updated',
      ),
    [run, updateMutation],
  );

  const deleteEventType = useCallback(
    (eventTypeId: number) =>
      run(
        () => deleteMutation({ variables: { eventTypeId } }),
        'Event type deleted',
      ),
    [run, deleteMutation],
  );

  return { pending, createEventType, updateEventType, deleteEventType };
};
