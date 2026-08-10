import { gql } from '@apollo/client';

// Operation names are prefixed with the plugin so they stay unique repo-wide,
// which erxes requires.
export const ENRICHMENT_PROVIDERS = gql`
  query EnrichmentProviders($customerId: String) {
    enrichmentProviders(customerId: $customerId) {
      key
      label
      isConfigured
      canHandle
      reason
    }
  }
`;

export const ENRICHMENT_LOGS = gql`
  query EnrichmentLogs($contentType: String!, $contentId: String!) {
    enrichmentLogs(contentType: $contentType, contentId: $contentId) {
      _id
      provider
      outcome
      errorMessage
      result
      createdAt
    }
  }
`;

export const ENRICHMENT_CONFIG_STATUS = gql`
  query EnrichmentConfigStatus {
    enrichmentConfigStatus {
      code
      isSet
      source
    }
  }
`;
