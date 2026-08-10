export const types = `
  type EnrichmentProvider {
    key: String
    label: String
    isConfigured: Boolean
    # Whether this provider has enough to work with for the record being
    # viewed. The UI disables its button when false rather than letting the
    # operator spend a credit to be told the same thing.
    canHandle: Boolean
    # Why not, when canHandle is false.
    reason: String
  }

  type EnrichmentConfigStatus {
    code: String
    isSet: Boolean
    # database | environment | unset — so an operator can tell a value set in
    # this UI from one baked into the deployment.
    source: String
  }

  type EnrichmentLog {
    _id: String
    provider: String
    outcome: String
    errorMessage: String
    result: JSON
    createdAt: Date
  }

  type EnrichmentOutcome {
    outcome: String
    provider: String
    message: String
    # Field code -> value, exactly what was written back.
    written: JSON
  }
`;

export const queries = `
  # Providers with their per-record availability. customerId is optional: the
  # settings screen asks without one to render configuration state alone.
  enrichmentProviders(customerId: String): [EnrichmentProvider]
  enrichmentConfigStatus: [EnrichmentConfigStatus]
  enrichmentLogs(contentType: String!, contentId: String!): [EnrichmentLog]
`;

export const mutations = `
  # overrides lets the operator supply the one missing input — a domain, a
  # LinkedIn URL, a GSTIN — for a record that lacks it.
  enrichCustomer(customerId: String!, provider: String!, overrides: JSON): EnrichmentOutcome
  enrichmentSetConfig(code: String!, value: String): EnrichmentConfigStatus
`;
