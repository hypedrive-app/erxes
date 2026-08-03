import { initTRPC } from '@trpc/server';

import { ITRPCContext } from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';
import { bookingsTrpcRouter } from '~/modules/bookings/trpc/bookings';

export type CalcomTRPCContext = ITRPCContext<{ models: IModels }>;

const t = initTRPC.context<CalcomTRPCContext>().create();

/**
 * tRPC is the service-to-service channel; GraphQL is for the browser.
 *
 * The generator left only a `hello` stub here, which meant the booking mirror
 * was unreachable from every other plugin — this plugin resolves attendees to
 * core customers, so contacts point at bookings nothing else could read.
 * bookingsTrpcRouter closes that.
 *
 * The context is typed with IModels: the generator's bare ITRPCContext gives
 * procedures no `models`, so every query below would be a type error against it.
 */
export const appRouter = t.mergeRouters(
  t.router({
    // `calcomPlugin`, not `calcom` — bookingsTrpcRouter owns the `calcom`
    // namespace, and mergeRouters on a duplicate key would clobber one side.
    calcomPlugin: {
      // Kept as a liveness probe: the cheapest way for another service to
      // confirm this plugin answers over tRPC, as distinct from merely being
      // registered in service discovery.
      hello: t.procedure.query(() => {
        return 'Hello calcom';
      }),
    },
  }),
  bookingsTrpcRouter,
);

export type AppRouter = typeof appRouter;
