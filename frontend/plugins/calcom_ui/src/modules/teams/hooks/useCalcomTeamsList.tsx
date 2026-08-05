import { useQuery } from '@apollo/client';

import { CALCOM_TEAMS_QUERY } from '~/modules/teams/graphql/teams';
import { ICalcomTeam } from '~/modules/teams/types/team';

export const useCalcomTeamsList = () => {
  const { data, loading, error } = useQuery<{ calcomTeams: ICalcomTeam[] }>(
    CALCOM_TEAMS_QUERY,
    { fetchPolicy: 'cache-and-network' },
  );

  return { teams: data?.calcomTeams ?? [], loading, error };
};
