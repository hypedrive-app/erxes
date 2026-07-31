import { gql } from '@apollo/client';

export const PLIVO_SOFTPHONE_INTEGRATIONS = gql`
  query plivoSoftphoneIntegrations {
    plivoSoftphoneIntegrations {
      _id
      name
      phoneNumber
    }
  }
`;

export const PLIVO_ACCESS_TOKEN = gql`
  query plivoAccessToken($integrationId: String!) {
    plivoAccessToken(integrationId: $integrationId) {
      token
      username
      expiresAt
      endpointUri
      phoneNumber
    }
  }
`;
