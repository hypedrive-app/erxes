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

/**
 * Every connected number with the settings that drive its call routing.
 *
 * The auth token is absent by design — it is write-only on the server and is
 * never sent to the browser.
 */
export const PLIVO_INTEGRATION_CONFIGS = gql`
  query plivoIntegrationConfigs {
    plivoIntegrationConfigs {
      _id
      name
      authId
      plivoPhoneNumber
      appId
      defaultCountryCode
      recordCalls
      forwardToNumber
      forwardTimeout
      ringAgents
      agentRingTimeout
      voicemailEnabled
      voicemailMaxLength
      voicemailGreeting
      healthStatus
      error
    }
  }
`;

/**
 * SIP credentials for this agent's browser softphone.
 *
 * The password is a live credential, so this is never cached — see the hook.
 */
export const PLIVO_SOFTPHONE_CREDENTIALS = gql`
  query plivoSoftphoneCredentials($integrationId: String!) {
    plivoSoftphoneCredentials(integrationId: $integrationId) {
      username
      password
      endpointUri
      phoneNumber
    }
  }
`;

export const PLIVO_CALL_HISTORIES = gql`
  query plivoCallHistories(
    $integrationId: String
    $customerId: String
    $direction: String
    $isVoicemail: Boolean
    $searchValue: String
    $limit: Int
    $skip: Int
  ) {
    plivoCallHistories(
      integrationId: $integrationId
      customerId: $customerId
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
