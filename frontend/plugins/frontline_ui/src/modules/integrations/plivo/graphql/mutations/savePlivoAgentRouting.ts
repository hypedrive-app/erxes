import { gql } from '@apollo/client';

export const SAVE_PLIVO_AGENT_ROUTING = gql`
  mutation PlivoSaveAgentRouting(
    $integrationId: String!
    $device: String!
    $phoneNumber: String
    $available: Boolean
  ) {
    plivoSaveAgentRouting(
      integrationId: $integrationId
      device: $device
      phoneNumber: $phoneNumber
      available: $available
    ) {
      integrationId
      device
      phoneNumber
      available
    }
  }
`;
