import { startPlugin } from 'erxes-api-shared/utils';
import { typeDefs } from '~/apollo/typeDefs';
import { appRouter } from '~/trpc/init-trpc';
import { resolvers } from '~/apollo/resolvers';
import { generateModels } from './connectionResolvers';

startPlugin({
  // Must match the name in the gateway's ENABLED_PLUGINS exactly: the gateway
  // derives its Redis discovery key `erxes-service-<name>` from that list, so a
  // mismatch means it waits for a plugin that never registers.
  name: 'calcom',
  // 3314, not the generator's default 33010 — insurance_api already declares
  // 33010, and the scaffold does not check for collisions. Highest in use here
  // is mongolian_api on 3313.
  port: 3314,
  graphql: async () => ({
    typeDefs: await typeDefs(),
    resolvers,
  }),
  apolloServerContext: async (subdomain, context) => {
    const models = await generateModels(subdomain);

    context.models = models;

    return context;
  },
  trpcAppRouter: {
    router: appRouter,
    createContext: async (subdomain, context) => {
      const models = await generateModels(subdomain);

      context.models = models;

      return context;
    },
  },
});

