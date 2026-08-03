import { gql } from '@apollo/client';

/**
 * White-label settings are a singleton, so there is no id to pass.
 *
 * These values were already stored and already served to the browser by
 * GET /initial-setup — they simply had no GraphQL surface, so nothing could
 * read or edit them.
 */
export const ORG_WHITE_LABEL = gql`
  query OrgWhiteLabel {
    orgWhiteLabel {
      orgLogo
      orgFavicon
      orgShortName
      orgShortDescription
      orgLoginText
      orgLoginDescription
      orgAccentColor
      enabled
    }
  }
`;

export const ORG_WHITE_LABEL_EDIT = gql`
  mutation OrgWhiteLabelEdit(
    $orgLogo: String
    $orgFavicon: String
    $orgShortName: String
    $orgShortDescription: String
    $orgLoginText: String
    $orgLoginDescription: String
    $orgAccentColor: String
    $enabled: Boolean
  ) {
    orgWhiteLabelEdit(
      orgLogo: $orgLogo
      orgFavicon: $orgFavicon
      orgShortName: $orgShortName
      orgShortDescription: $orgShortDescription
      orgLoginText: $orgLoginText
      orgLoginDescription: $orgLoginDescription
      orgAccentColor: $orgAccentColor
      enabled: $enabled
    ) {
      orgLogo
      orgFavicon
      orgShortName
      orgShortDescription
      orgLoginText
      orgLoginDescription
      orgAccentColor
      enabled
    }
  }
`;
