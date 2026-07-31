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

export const PLIVO_CALL_HISTORIES = gql`
  query plivoCallHistories(
    $integrationId: String
    $direction: String
    $isVoicemail: Boolean
    $searchValue: String
    $limit: Int
    $skip: Int
  ) {
    plivoCallHistories(
      integrationId: $integrationId
      direction: $direction
      isVoicemail: $isVoicemail
      searchValue: $searchValue
      limit: $limit
      skip: $skip
    ) {
      list {
        _id
        callUuid
        conversationId
        direction
        status
        from
        to
        counterpartNumber
        duration
        hangupCause
        recordUrl
        recordingDuration
        isVoicemail
        voicemailLeftAt
        startedAt
        answeredAt
        endedAt
        createdAt
        customer {
          _id
          firstName
          lastName
          primaryPhone
          avatar
        }
      }
      totalCount
    }
  }
`;
