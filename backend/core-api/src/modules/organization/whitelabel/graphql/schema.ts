export const types = `
  """
  Instance-wide white-label settings — a singleton, not a per-record entity.

  These were already stored and already served to the browser by
  GET /initial-setup, but had no GraphQL surface at all, so nothing could read
  or edit them. This is that surface.
  """
  type OrgWhiteLabel {
    orgLogo: String
    orgFavicon: String
    orgShortName: String
    orgShortDescription: String
    orgLoginText: String
    orgLoginDescription: String

    """
    Accent colour as hex, e.g. "#3B90FA". Applied by the browser, which
    converts it to oklch and overrides the accent tokens — so a change takes
    effect on reload with no rebuild.
    """
    orgAccentColor: String

    """
    Master switch. /initial-setup only merges these into the organization
    payload when enabled, so turning it off restores stock erxes branding
    without discarding what was configured.
    """
    enabled: Boolean
  }
`;

export const queries = `
  orgWhiteLabel: OrgWhiteLabel
`;

export const mutations = `
  orgWhiteLabelEdit(
    orgLogo: String
    orgFavicon: String
    orgShortName: String
    orgShortDescription: String
    orgLoginText: String
    orgLoginDescription: String
    orgAccentColor: String
    enabled: Boolean
  ): OrgWhiteLabel
`;
