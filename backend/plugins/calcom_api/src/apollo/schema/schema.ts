import {
  mutations as BookingsMutations,
  queries as BookingsQueries,
  types as BookingsTypes,
} from '@/bookings/graphql/schemas/bookings';
import {
  mutations as EventTypesMutations,
  queries as EventTypesQueries,
  types as EventTypesTypes,
} from '@/eventTypes/graphql/schemas/eventTypes';
import {
  mutations as SchedulesMutations,
  queries as SchedulesQueries,
  types as SchedulesTypes,
} from '@/schedules/graphql/schemas/schedules';
import {
  mutations as TeamsMutations,
  queries as TeamsQueries,
  types as TeamsTypes,
} from '@/teams/graphql/schemas/teams';

export const types = `
  ${BookingsTypes}
  ${EventTypesTypes}
  ${SchedulesTypes}
  ${TeamsTypes}
`;

export const queries = `
  ${BookingsQueries}
  ${EventTypesQueries}
  ${SchedulesQueries}
  ${TeamsQueries}
`;

export const mutations = `
  ${BookingsMutations}
  ${EventTypesMutations}
  ${SchedulesMutations}
  ${TeamsMutations}
`;
