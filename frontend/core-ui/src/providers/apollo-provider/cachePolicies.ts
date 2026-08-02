export const apolloTypePolicies = {
  User: {
    fields: {
      details: {
        merge: true,
      },
    },
  },
  customers: {
    keyFields: ['_id'],
  },
};
