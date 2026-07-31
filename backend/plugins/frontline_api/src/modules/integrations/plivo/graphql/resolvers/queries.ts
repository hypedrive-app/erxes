import { IContext } from '~/connectionResolvers';
import {
  generatePlivoAccessToken,
  IPlivoAccessToken,
} from '@/integrations/plivo/accessToken';
import { ensurePlivoEndpoint } from '@/integrations/plivo/helpers';

/** What the widget needs to offer a number, and nothing more. */
export interface IPlivoSoftphoneIntegration {
  _id: string;
  name: string;
  phoneNumber?: string;
}

export const plivoQueries = {
  /**
   * The Plivo numbers this agent can answer on in the browser.
   *
   * The floating softphone has no channel in scope — it is mounted app-wide —
   * so it cannot use the channel-scoped `integrations` list. This returns every
   * ACTIVE Plivo integration that is actually dialable, letting the widget
   * auto-select when there is exactly one and offer a picker when there are
   * several.
   *
   * Credentials never leave the server: only the id, name and caller id are
   * exposed, and a token still has to be minted through `plivoAccessToken`.
   *
   * An integration with no stored credentials is omitted rather than offered,
   * because picking it could only ever fail at the token step — which is the
   * dead end this query exists to remove.
   */
  plivoSoftphoneIntegrations: async (
    _root: undefined,
    _args: undefined,
    { models, user }: IContext,
  ): Promise<IPlivoSoftphoneIntegration[]> => {
    if (!user?._id) {
      throw new Error('Login required');
    }

    const plivoIntegrations = await models.PlivoIntegrations.find({
      authId: { $nin: [null, ''] },
      authToken: { $nin: [null, ''] },
      erxesApiId: { $nin: [null, ''] },
    }).lean();

    if (!plivoIntegrations.length) {
      return [];
    }

    // The inbox row is the authority on the name the agent recognises and on
    // whether the integration is still active; an archived one must not be
    // offered as somewhere to receive calls.
    const inboxIntegrations = await models.Integrations.find({
      _id: { $in: plivoIntegrations.map((integration) => integration.erxesApiId) },
      isActive: { $ne: false },
    }).lean();

    const phoneNumberById = new Map(
      plivoIntegrations.map((integration) => [
        integration.erxesApiId,
        integration.plivoPhoneNumber,
      ]),
    );

    return inboxIntegrations.map((integration) => {
      const phoneNumber = phoneNumberById.get(integration._id);

      return {
        _id: integration._id,
        // `name` is optional on the inbox row, and an unnamed integration must
        // still be pickable — the number it dials from identifies it well
        // enough for the widget's list.
        name: integration.name || phoneNumber || integration._id,
        phoneNumber,
      };
    });
  },

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
