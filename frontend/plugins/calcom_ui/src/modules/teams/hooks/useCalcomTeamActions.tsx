import { useMutation } from '@apollo/client';
import { toast } from 'erxes-ui';
import { useCallback, useState } from 'react';

import {
  CALCOM_CREATE_TEAM,
  CALCOM_DELETE_TEAM,
  CALCOM_TEAMS_QUERY,
  CALCOM_UPDATE_TEAM,
} from '~/modules/teams/graphql/teams';

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong';

export const useCalcomTeamActions = () => {
  const [pending, setPending] = useState(false);

  const [createMutation] = useMutation(CALCOM_CREATE_TEAM, {
    refetchQueries: [CALCOM_TEAMS_QUERY],
  });
  const [updateMutation] = useMutation(CALCOM_UPDATE_TEAM, {
    refetchQueries: [CALCOM_TEAMS_QUERY],
  });
  const [deleteMutation] = useMutation(CALCOM_DELETE_TEAM, {
    refetchQueries: [CALCOM_TEAMS_QUERY],
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

  const createTeam = useCallback(
    (input: { name: string; slug?: string; bio?: string }) =>
      run(() => createMutation({ variables: input }), 'Team created in Cal.com'),
    [run, createMutation],
  );

  const updateTeam = useCallback(
    (
      teamId: number,
      input: Partial<{ name: string; slug: string; bio: string }>,
    ) =>
      run(
        () => updateMutation({ variables: { teamId, ...input } }),
        'Team updated',
      ),
    [run, updateMutation],
  );

  const deleteTeam = useCallback(
    (teamId: number) =>
      run(() => deleteMutation({ variables: { teamId } }), 'Team deleted'),
    [run, deleteMutation],
  );

  return { pending, createTeam, updateTeam, deleteTeam };
};
