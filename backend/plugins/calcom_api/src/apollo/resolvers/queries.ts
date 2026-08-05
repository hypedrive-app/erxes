import { bookingsQueries } from '@/bookings/graphql/resolvers/queries/bookings';
import { eventTypesQueries } from '@/eventTypes/graphql/resolvers/queries/eventTypes';
import { schedulesQueries } from '@/schedules/graphql/resolvers/queries/schedules';
import { teamsQueries } from '@/teams/graphql/resolvers/queries/teams';

export const queries = {
  ...bookingsQueries,
  ...eventTypesQueries,
  ...schedulesQueries,
  ...teamsQueries,
};
