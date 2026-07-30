import { gql } from '@apollo/client';

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
