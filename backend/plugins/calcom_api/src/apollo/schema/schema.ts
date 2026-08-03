import {
  mutations as BookingsMutations,
  queries as BookingsQueries,
  types as BookingsTypes,
} from '@/bookings/graphql/schemas/bookings';

export const types = `
  ${BookingsTypes}
`;

export const queries = `
  ${BookingsQueries}
`;

export const mutations = `
  ${BookingsMutations}
`;
