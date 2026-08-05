import { bookingsMutations } from '@/bookings/graphql/resolvers/mutations/bookings';
import { eventTypesMutations } from '@/eventTypes/graphql/resolvers/mutations/eventTypes';
import { schedulesMutations } from '@/schedules/graphql/resolvers/mutations/schedules';
import { teamsMutations } from '@/teams/graphql/resolvers/mutations/teams';

export const mutations = {
  ...bookingsMutations,
  ...eventTypesMutations,
  ...schedulesMutations,
  ...teamsMutations,
};
