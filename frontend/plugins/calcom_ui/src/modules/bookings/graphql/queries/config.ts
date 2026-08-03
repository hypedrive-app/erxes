import { gql } from '@apollo/client';

/**
 * Settings never carry their values.
 *
 * The backend returns only whether each setting is configured and where it came
 * from — a live API key and a webhook signing secret in a query response would
 * be readable from the network tab by anyone with settings access. The form
 * writes values; it never reads them back.
 */
export const CALCOM_CONFIG_STATUS_QUERY = gql`
  query CalcomConfigStatus {
    calcomConfigStatus {
      code
      isSet
      source
    }
  }
`;

export const CALCOM_SET_CONFIG = gql`
  mutation CalcomSetConfig($code: String!, $value: String) {
    calcomSetConfig(code: $code, value: $value) {
      code
      isSet
      source
    }
  }
`;
