import { useMutation, useQuery } from '@apollo/client';
import { toast } from 'erxes-ui';
import { useCallback, useState } from 'react';

import {
  CALCOM_ADD_TEAM_MEMBER,
  CALCOM_REMOVE_TEAM_MEMBER,
  CALCOM_TEAM_MEMBERSHIPS_QUERY,
  CALCOM_UPDATE_TEAM_MEMBER,
} from '~/modules/teams/graphql/teams';
import { ICalcomTeamMembership } from '~/modules/teams/types/team';

const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong';

export const useCalcomTeamMemberships = (teamId?: number) => {
  const { data, loading, error } = useQuery<{
    calcomTeamMemberships: ICalcomTeamMembership[];
  }>(CALCOM_TEAM_MEMBERSHIPS_QUERY, {
    variables: { teamId },
    skip: !teamId,
    fetchPolicy: 'cache-and-network',
  });

  const [pending, setPending] = useState(false);

  const refetchQuery = {
    query: CALCOM_TEAM_MEMBERSHIPS_QUERY,
    variables: { teamId },
  };

  const [addMutation] = useMutation(CALCOM_ADD_TEAM_MEMBER, {
    refetchQueries: [refetchQuery],
  });
  const [updateMutation] = useMutation(CALCOM_UPDATE_TEAM_MEMBER, {
    refetchQueries: [refetchQuery],
  });
  const [removeMutation] = useMutation(CALCOM_REMOVE_TEAM_MEMBER, {
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

  const addMember = useCallback(
    (userId: number, role?: string) =>
      run(
        () => addMutation({ variables: { teamId, userId, role } }),
        'Member added',
      ),
    [run, addMutation, teamId],
  );

  const updateMember = useCallback(
    (membershipId: number, role: string) =>
      run(
        () => updateMutation({ variables: { teamId, membershipId, role } }),
        'Member role updated',
      ),
    [run, updateMutation, teamId],
  );

  const removeMember = useCallback(
    (membershipId: number) =>
      run(
        () => removeMutation({ variables: { teamId, membershipId } }),
        'Member removed',
      ),
    [run, removeMutation, teamId],
  );

  return {
    memberships: data?.calcomTeamMemberships ?? [],
    loading,
    error,
    pending,
    addMember,
    updateMember,
    removeMember,
  };
};
