import { gql } from '@apollo/client';

export const PLIVO_AGENT_ROUTING = gql`
  query PlivoAgentRouting($integrationId: String!) {
    plivoAgentRouting(integrationId: $integrationId) {
      integrationId
      device
      phoneNumber
      available
    }
  }
`;
