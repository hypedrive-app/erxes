import { startPlugin } from 'erxes-api-shared/utils';
import { typeDefs } from '~/apollo/typeDefs';
import { appRouter } from '~/trpc/init-trpc';
import { resolvers } from '~/apollo/resolvers';
import { generateModels } from './connectionResolvers';

startPlugin({
  name: 'enrichment',
  // 3315 and not the generator's default 33010, which insurance_api already
  // claims — two plugins on one port means whichever boots second never
  // registers, and the gateway resolves it to the wrong service.
  port: 3315,
  graphql: async () => ({
    typeDefs: await typeDefs(),
    resolvers,
  }),
  apolloServerContext: async (subdomain, context) => {
    const models = await generateModels(subdomain);

    context.models = models;
    // Every resolver here reaches core over tRPC to read the customer and write
    // results back, and sendTRPCMessage needs the subdomain to address the
    // right tenant. IMainContext does not carry it, so it is put on explicitly
    // rather than each resolver re-deriving it from the request.
    context.subdomain = subdomain;

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

