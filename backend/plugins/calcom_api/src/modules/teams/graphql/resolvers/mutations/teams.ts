import { IContext } from '~/connectionResolvers';

import {
  CalcomTeamInput,
  CalcomTeamMembershipInput,
  createCalcomTeam,
  createCalcomTeamEventType,
  createCalcomTeamMembership,
  deleteCalcomTeam,
  deleteCalcomTeamEventType,
  deleteCalcomTeamMembership,
  updateCalcomTeam,
  updateCalcomTeamEventType,
  updateCalcomTeamMembership,
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

export const teamsMutations = {
  calcomCreateTeam: async (
    _parent: undefined,
    input: CalcomTeamInput,
    { models }: IContext,
  ) => {
    const result = await createCalcomTeam(models, input);
    return toTeam(result?.data ?? result);
  },

  calcomUpdateTeam: async (
    _parent: undefined,
    { teamId, ...input }: { teamId: number } & Partial<CalcomTeamInput>,
    { models }: IContext,
  ) => {
    const result = await updateCalcomTeam(models, teamId, input);
    return toTeam(result?.data ?? result);
  },

  calcomDeleteTeam: async (
    _parent: undefined,
    { teamId }: { teamId: number },
    { models }: IContext,
  ) => {
    await deleteCalcomTeam(models, teamId);
    return { ok: true, uid: String(teamId) };
  },

  calcomAddTeamMember: async (
    _parent: undefined,
    { teamId, ...input }: { teamId: number } & CalcomTeamMembershipInput,
    { models }: IContext,
  ) => {
    const result = await createCalcomTeamMembership(models, teamId, input);
    return toMembership(result?.data ?? result);
  },

  calcomUpdateTeamMember: async (
    _parent: undefined,
    {
      teamId,
      membershipId,
      ...input
    }: { teamId: number; membershipId: number } & Partial<
      Omit<CalcomTeamMembershipInput, 'userId'>
    >,
    { models }: IContext,
  ) => {
    const result = await updateCalcomTeamMembership(
      models,
      teamId,
      membershipId,
      input,
    );
    return toMembership(result?.data ?? result);
  },

  calcomRemoveTeamMember: async (
    _parent: undefined,
    { teamId, membershipId }: { teamId: number; membershipId: number },
    { models }: IContext,
  ) => {
    await deleteCalcomTeamMembership(models, teamId, membershipId);
    return { ok: true, uid: String(membershipId) };
  },

  calcomCreateTeamEventType: async (
    _parent: undefined,
    {
      teamId,
      ...input
    }: {
      teamId: number;
      title: string;
      slug: string;
      lengthInMinutes: number;
      description?: string;
      hidden?: boolean;
    },
    { models }: IContext,
  ) => {
    const result = await createCalcomTeamEventType(models, teamId, input);
    return toTeamEventType(result?.data ?? result, teamId);
  },

  calcomUpdateTeamEventType: async (
    _parent: undefined,
    {
      teamId,
      eventTypeId,
      ...input
    }: {
      teamId: number;
      eventTypeId: number;
      title?: string;
      slug?: string;
      lengthInMinutes?: number;
      description?: string;
      hidden?: boolean;
    },
    { models }: IContext,
  ) => {
    const result = await updateCalcomTeamEventType(
      models,
      teamId,
      eventTypeId,
      input,
    );
    return toTeamEventType(result?.data ?? result, teamId);
  },

  calcomDeleteTeamEventType: async (
    _parent: undefined,
    { teamId, eventTypeId }: { teamId: number; eventTypeId: number },
    { models }: IContext,
  ) => {
    await deleteCalcomTeamEventType(models, teamId, eventTypeId);
    return { ok: true, uid: String(eventTypeId) };
  },
};
