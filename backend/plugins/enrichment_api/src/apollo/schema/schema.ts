import {
  mutations as ProvidersMutations,
  queries as ProvidersQueries,
  types as ProvidersTypes,
} from '@/providers/graphql/schemas/providers';

export const types = `
  ${ProvidersTypes}
`;

export const queries = `
  ${ProvidersQueries}
`;

export const mutations = `
  ${ProvidersMutations}
`;
