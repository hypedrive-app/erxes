import { IModels } from '~/connectionResolvers';

import { calcomRequest } from '@/bookings/calcomApi';

/**
 * Cal.com v2 teams, memberships, and team event-types.
 *
 * Team round-robin/collective scheduling is Cal.com-side configuration with
 * no webhook of its own (a BOOKING_CREATED webhook names the event type, never
 * a team change), so this reads and writes live like eventTypes/calcomApi and
 * schedules/calcomApi.
 *
 * Team endpoints do not carry a `cal-api-version` requirement the way
 * bookings/event-types/schedules do — verified against
 * apps/api/v2/src/modules/teams in the cal.com fork, whose @Controller uses
 * API_VERSIONS_VALUES (any accepted version) rather than a single pinned one.
 */

export interface CalcomTeamInput {
  name: string;
  slug?: string;
  logoUrl?: string;
  bio?: string;
  hideBranding?: boolean;
}

export const listCalcomTeams = async (
  models: IModels | undefined,
): Promise<any> => calcomRequest('/teams', { method: 'GET', models });

export const getCalcomTeam = async (
  models: IModels | undefined,
  teamId: number,
): Promise<any> =>
  calcomRequest(`/teams/${encodeURIComponent(String(teamId))}`, {
    method: 'GET',
    models,
  });

export const createCalcomTeam = async (
  models: IModels | undefined,
  input: CalcomTeamInput,
): Promise<any> =>
  calcomRequest('/teams', { method: 'POST', body: input, models });

export const updateCalcomTeam = async (
  models: IModels | undefined,
  teamId: number,
  input: Partial<CalcomTeamInput>,
): Promise<any> =>
  calcomRequest(`/teams/${encodeURIComponent(String(teamId))}`, {
    method: 'PATCH',
    body: input,
    models,
  });

export const deleteCalcomTeam = async (
  models: IModels | undefined,
  teamId: number,
): Promise<any> =>
  calcomRequest(`/teams/${encodeURIComponent(String(teamId))}`, {
    method: 'DELETE',
    models,
  });

export interface CalcomTeamMembershipInput {
  userId: number;
  role?: 'MEMBER' | 'OWNER' | 'ADMIN';
  accepted?: boolean;
}

export const listCalcomTeamMemberships = async (
  models: IModels | undefined,
  teamId: number,
): Promise<any> =>
  calcomRequest(
    `/teams/${encodeURIComponent(String(teamId))}/memberships`,
    { method: 'GET', models },
  );

export const createCalcomTeamMembership = async (
  models: IModels | undefined,
  teamId: number,
  input: CalcomTeamMembershipInput,
): Promise<any> =>
  calcomRequest(
    `/teams/${encodeURIComponent(String(teamId))}/memberships`,
    { method: 'POST', body: input, models },
  );

export const updateCalcomTeamMembership = async (
  models: IModels | undefined,
  teamId: number,
  membershipId: number,
  input: Partial<Omit<CalcomTeamMembershipInput, 'userId'>>,
): Promise<any> =>
  calcomRequest(
    `/teams/${encodeURIComponent(String(teamId))}/memberships/${encodeURIComponent(
      String(membershipId),
    )}`,
    { method: 'PATCH', body: input, models },
  );

export const deleteCalcomTeamMembership = async (
  models: IModels | undefined,
  teamId: number,
  membershipId: number,
): Promise<any> =>
  calcomRequest(
    `/teams/${encodeURIComponent(String(teamId))}/memberships/${encodeURIComponent(
      String(membershipId),
    )}`,
    { method: 'DELETE', models },
  );

/**
 * Team-scoped event types — the round-robin/collective bookable types that
 * live under a team rather than a single user. Same input shape as a personal
 * event type (title/slug/lengthInMinutes) per
 * apps/api/v2/src/modules/teams/event-types in the cal.com fork, plus the
 * team's own hosts/assignment config, which this passes through untyped
 * rather than re-declaring the whole personal-event-type input a second time.
 */
export const listCalcomTeamEventTypes = async (
  models: IModels | undefined,
  teamId: number,
): Promise<any> =>
  calcomRequest(
    `/teams/${encodeURIComponent(String(teamId))}/event-types`,
    { method: 'GET', apiVersion: '2024-06-14', models },
  );

export const createCalcomTeamEventType = async (
  models: IModels | undefined,
  teamId: number,
  input: Record<string, unknown>,
): Promise<any> =>
  calcomRequest(
    `/teams/${encodeURIComponent(String(teamId))}/event-types`,
    { method: 'POST', body: input, apiVersion: '2024-06-14', models },
  );

export const updateCalcomTeamEventType = async (
  models: IModels | undefined,
  teamId: number,
  eventTypeId: number,
  input: Record<string, unknown>,
): Promise<any> =>
  calcomRequest(
    `/teams/${encodeURIComponent(String(teamId))}/event-types/${encodeURIComponent(
      String(eventTypeId),
    )}`,
    { method: 'PATCH', body: input, apiVersion: '2024-06-14', models },
  );

export const deleteCalcomTeamEventType = async (
  models: IModels | undefined,
  teamId: number,
  eventTypeId: number,
): Promise<any> =>
  calcomRequest(
    `/teams/${encodeURIComponent(String(teamId))}/event-types/${encodeURIComponent(
      String(eventTypeId),
    )}`,
    { method: 'DELETE', apiVersion: '2024-06-14', models },
  );
