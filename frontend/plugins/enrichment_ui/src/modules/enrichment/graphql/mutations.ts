import { gql } from '@apollo/client';

export const ENRICH_CUSTOMER = gql`
  mutation EnrichCustomer(
    $customerId: String!
    $provider: String!
    $overrides: JSON
  ) {
    enrichCustomer(
      customerId: $customerId
      provider: $provider
      overrides: $overrides
    ) {
      outcome
      provider
      message
      written
    }
  }
`;

export const ENRICHMENT_SET_CONFIG = gql`
  mutation EnrichmentSetConfig($code: String!, $value: String) {
    enrichmentSetConfig(code: $code, value: $value) {
      code
      isSet
      source
    }
  }
`;
