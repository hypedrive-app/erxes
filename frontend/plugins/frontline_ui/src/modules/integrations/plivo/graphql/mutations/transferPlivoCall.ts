import { gql } from '@apollo/client';

export const TRANSFER_PLIVO_CALL = gql`
  mutation PlivoTransferCall(
    $integrationId: String!
    $callUuid: String!
    $to: String!
  ) {
    plivoTransferCall(
      integrationId: $integrationId
      callUuid: $callUuid
      to: $to
    ) {
      callUuid
    }
  }
`;
