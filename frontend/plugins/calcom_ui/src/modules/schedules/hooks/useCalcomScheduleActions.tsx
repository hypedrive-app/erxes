import { useMutation } from '@apollo/client';
import { toast } from 'erxes-ui';
import { useCallback, useState } from 'react';

import {
  CALCOM_CREATE_SCHEDULE,
  CALCOM_DELETE_SCHEDULE,
  CALCOM_SCHEDULES_QUERY,
  CALCOM_UPDATE_SCHEDULE,
} from '~/modules/schedules/graphql/schedules';
import { ICalcomScheduleAvailability } from '~/modules/schedules/types/schedule';

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong';

export const useCalcomScheduleActions = () => {
  const [pending, setPending] = useState(false);

  const [createMutation] = useMutation(CALCOM_CREATE_SCHEDULE, {
    refetchQueries: [CALCOM_SCHEDULES_QUERY],
  });
  const [updateMutation] = useMutation(CALCOM_UPDATE_SCHEDULE, {
    refetchQueries: [CALCOM_SCHEDULES_QUERY],
  });
  const [deleteMutation] = useMutation(CALCOM_DELETE_SCHEDULE, {
    refetchQueries: [CALCOM_SCHEDULES_QUERY],
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

  const createSchedule = useCallback(
    (input: {
      name: string;
      timeZone: string;
      isDefault: boolean;
      availability?: ICalcomScheduleAvailability[];
    }) =>
      run(
        () => createMutation({ variables: input }),
        'Schedule created in Cal.com',
      ),
    [run, createMutation],
  );

  const updateSchedule = useCallback(
    (
      scheduleId: number,
      input: Partial<{
        name: string;
        timeZone: string;
        isDefault: boolean;
        availability: ICalcomScheduleAvailability[];
      }>,
    ) =>
      run(
        () => updateMutation({ variables: { scheduleId, ...input } }),
        'Schedule updated',
      ),
    [run, updateMutation],
  );

  const deleteSchedule = useCallback(
    (scheduleId: number) =>
      run(
        () => deleteMutation({ variables: { scheduleId } }),
        'Schedule deleted',
      ),
    [run, deleteMutation],
  );

  return { pending, createSchedule, updateSchedule, deleteSchedule };
};
