import { IContext } from '~/connectionResolvers';
import {
  generatePlivoAccessToken,
  IPlivoAccessToken,
} from '@/integrations/plivo/accessToken';
import { buildPlivoEndpointUsername } from '@/integrations/plivo/helpers';

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
    const integration = await models.PlivoIntegrations.getIntegration({
      erxesApiId: integrationId,
    });

    const { authId, authToken, appId, plivoPhoneNumber } = integration;

    if (!authId || !authToken) {
      throw new Error(
        'This Plivo integration has no credentials stored. Reconnect it before calling from the browser.',
      );
    }

    // One endpoint per agent per integration: two browsers sharing a username
    // would race for the same registration and only the last one would ring.
    const username = buildPlivoEndpointUsername(integrationId, user._id);

    const accessToken = generatePlivoAccessToken({
      authId,
      authToken,
      username,
      appId,
    });

    return { ...accessToken, phoneNumber: plivoPhoneNumber };
  },
};
