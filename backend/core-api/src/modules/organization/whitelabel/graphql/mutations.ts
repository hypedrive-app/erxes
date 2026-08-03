import { IOrgWhiteLabel } from '@/organization/whitelabel/@types/orgWhiteLabel';
import { IContext } from '~/connectionResolvers';

/**
 * Hex colours only, three or six digits, with or without the leading hash.
 *
 * Validated here rather than trusted: this value is written into a CSS custom
 * property in every browser that loads the app, so an unvalidated string is
 * both a broken-theme risk and a needless injection surface.
 */
const HEX_COLOUR = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const orgWhiteLabelMutations = {
  async orgWhiteLabelEdit(
    _root: undefined,
    doc: IOrgWhiteLabel,
    { models, checkPermission }: IContext,
  ) {
    await checkPermission('whiteLabelManage');

    if (doc.orgAccentColor) {
      const value = doc.orgAccentColor.trim();

      if (!HEX_COLOUR.test(value)) {
        throw new Error(
          `"${value}" is not a hex colour. Use a value like #3B90FA.`,
        );
      }

      // Normalised on the way in so the stored value is predictable for
      // everything that reads it, while still being what the operator meant.
      doc.orgAccentColor = value.startsWith('#') ? value : `#${value}`;
    }

    return models.OrgWhiteLabel.upsertOrgWhiteLabel(doc);
  },
};
