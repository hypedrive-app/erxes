import { useMutation, useQuery } from '@apollo/client';
import { toast } from 'erxes-ui';
import { useCallback, useState } from 'react';

import {
  CALCOM_CREATE_TEAM_EVENT_TYPE,
  CALCOM_DELETE_TEAM_EVENT_TYPE,
  CALCOM_TEAM_EVENT_TYPES_QUERY,
  CALCOM_UPDATE_TEAM_EVENT_TYPE,
} from '~/modules/teams/graphql/teams';
import { ICalcomTeamEventType } from '~/modules/teams/types/team';

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong';

export const useCalcomTeamEventTypes = (teamId?: number) => {
  const { data, loading, error } = useQuery<{
    calcomTeamEventTypes: ICalcomTeamEventType[];
  }>(CALCOM_TEAM_EVENT_TYPES_QUERY, {
    variables: { teamId },
    skip: !teamId,
    fetchPolicy: 'cache-and-network',
  });

  const [pending, setPending] = useState(false);

  const refetchQuery = {
    query: CALCOM_TEAM_EVENT_TYPES_QUERY,
    variables: { teamId },
  };

  const [createMutation] = useMutation(CALCOM_CREATE_TEAM_EVENT_TYPE, {
    refetchQueries: [refetchQuery],
  });
  const [updateMutation] = useMutation(CALCOM_UPDATE_TEAM_EVENT_TYPE, {
    refetchQueries: [refetchQuery],
  });
  const [deleteMutation] = useMutation(CALCOM_DELETE_TEAM_EVENT_TYPE, {
    refetchQueries: [refetchQuery],
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

  const createTeamEventType = useCallback(
    (input: {
      title: string;
      slug: string;
      lengthInMinutes: number;
      description?: string;
      hidden?: boolean;
    }) =>
      run(
        () => createMutation({ variables: { teamId, ...input } }),
        'Team event type created',
      ),
    [run, createMutation, teamId],
  );

  const updateTeamEventType = useCallback(
    (
      eventTypeId: number,
      input: {
        title?: string;
        slug?: string;
        lengthInMinutes?: number;
        description?: string;
        hidden?: boolean;
      },
    ) =>
      run(
        () => updateMutation({ variables: { teamId, eventTypeId, ...input } }),
        'Team event type updated',
      ),
    [run, updateMutation, teamId],
  );

  const deleteTeamEventType = useCallback(
    (eventTypeId: number) =>
      run(
        () => deleteMutation({ variables: { teamId, eventTypeId } }),
        'Team event type deleted',
      ),
    [run, deleteMutation, teamId],
  );

  return {
    teamEventTypes: data?.calcomTeamEventTypes ?? [],
    loading,
    error,
    pending,
    createTeamEventType,
    updateTeamEventType,
    deleteTeamEventType,
  };
};
