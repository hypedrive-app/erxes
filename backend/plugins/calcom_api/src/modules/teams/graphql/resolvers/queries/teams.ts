import { IContext } from '~/connectionResolvers';

import {
  getCalcomTeam,
  listCalcomTeamEventTypes,
  listCalcomTeamMemberships,
  listCalcomTeams,
} from '@/teams/calcomApi';

const toTeam = (raw: any) => ({
  id: raw?.id,
  name: raw?.name,
  slug: raw?.slug,
  logoUrl: raw?.logoUrl,
  bio: raw?.bio,
});

const toMembership = (raw: any) => ({
  id: raw?.id,
  userId: raw?.userId,
  teamId: raw?.teamId,
  role: raw?.role,
  accepted: raw?.accepted,
});

const toTeamEventType = (raw: any, teamId: number) => ({
  id: raw?.id,
  teamId,
  title: raw?.title,
  slug: raw?.slug,
  lengthInMinutes: raw?.lengthInMinutes ?? raw?.length,
  description: raw?.description,
  hidden: raw?.hidden,
});

export const teamsQueries = {
  calcomTeams: async (
    _parent: undefined,
    _args: undefined,
    { models }: IContext,
  ) => {
    const result = await listCalcomTeams(models);
    const raw: any[] = Array.isArray(result) ? result : result?.data || [];

    return raw.map(toTeam);
  },

  calcomTeam: async (
    _parent: undefined,
    { teamId }: { teamId: number },
    { models }: IContext,
  ) => {
    const result = await getCalcomTeam(models, teamId);
    const data = result?.data ?? result;

    return data?.id ? toTeam(data) : null;
  },

  calcomTeamMemberships: async (
    _parent: undefined,
    { teamId }: { teamId: number },
    { models }: IContext,
  ) => {
    const result = await listCalcomTeamMemberships(models, teamId);
    const raw: any[] = Array.isArray(result) ? result : result?.data || [];

    return raw.map(toMembership);
  },

  calcomTeamEventTypes: async (
    _parent: undefined,
    { teamId }: { teamId: number },
    { models }: IContext,
  ) => {
    const result = await listCalcomTeamEventTypes(models, teamId);
    const raw: any[] = Array.isArray(result) ? result : result?.data || [];

    return raw.map((eventType) => toTeamEventType(eventType, teamId));
  },
};
