import { IContext } from '~/connectionResolvers';
import {
  generatePlivoAccessToken,
  IPlivoAccessToken,
} from '@/integrations/plivo/accessToken';
import { ensurePlivoEndpoint } from '@/integrations/plivo/helpers';

export const plivoQueries = {
  /**
   * Mints a browser softphone access token for the requesting agent.
   *
   * This resolver deliberately carries NO `wrapperConfig`, so the plugin's
   * Apollo wrapper applies `wrapPermission` and rejects an anonymous caller
   * before the body runs — minting calling credentials must never be reachable
   * without a session.
   *
   * The account's `authId`/`authToken` stay on the server: the auth token is
   * used only as the signing key, so what the browser receives is a token
   * scoped to one endpoint that expires on its own.
   */
  plivoAccessToken: async (
    _root: undefined,
    { integrationId }: { integrationId: string },
    { models, user }: IContext,
  ): Promise<IPlivoAccessToken & { phoneNumber?: string }> => {
    // This mints credentials that can place and receive calls on the account,
    // so an unauthenticated caller must never reach the signing step. The
    // endpoint username is derived from the user id as well, which would be
    // meaningless without one.
    if (!user?._id) {
      throw new Error('Login required');
    }

    const integration = await models.PlivoIntegrations.getIntegration({
      erxesApiId: integrationId,
    });

    const { authId, authToken, appId, plivoPhoneNumber } = integration;

    if (!authId || !authToken) {
      throw new Error(
        'This Plivo integration has no credentials stored. Reconnect it before calling from the browser.',
      );
    }

    // A token on its own does not make the browser reachable — `<Dial><User>`
    // can only ring a SIP endpoint that exists — so one is provisioned before
    // the token is minted. One endpoint per agent per integration: two browsers
    // sharing a username would race for the same registration and only the last
    // one would ring.
    const endpoint = await ensurePlivoEndpoint({
      authId,
      authToken,
      integrationId,
      userId: user._id,
      appId,
    });

    // Plivo appends a 12-digit number to the requested username, so the token's
    // `sub` and the SIP URI must both use the name Plivo actually assigned.
    const accessToken = generatePlivoAccessToken({
      authId,
      authToken,
      username: endpoint.username,
      appId,
    });

    return { ...accessToken, phoneNumber: plivoPhoneNumber };
  },
};
