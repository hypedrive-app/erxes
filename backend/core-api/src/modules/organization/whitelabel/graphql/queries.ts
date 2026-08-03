import { IContext } from '~/connectionResolvers';

export const orgWhiteLabelQueries = {
  /**
   * The white-label singleton.
   *
   * Readable by anyone who can see settings — these are the logo, name and
   * accent colour every user already sees rendered, so there is nothing here
   * to withhold. Editing is what is permission-gated.
   */
  async orgWhiteLabel(_root: undefined, _args: undefined, { models }: IContext) {
    return models.OrgWhiteLabel.getOrgWhiteLabel();
  },
};
