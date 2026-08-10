import { IContext } from '~/connectionResolvers';
import { handlePlivoClickToCall } from '@/integrations/plivo/handlePlivoCall';
import {
  hangupPlivoCall,
  PlivoApiError,
  transferPlivoCall,
} from '@/integrations/plivo/utils';
import { getPlivoCallbackBaseUrl } from '@/integrations/plivo/callbackUrl';
import { normalizePhone } from 'erxes-api-shared/utils';

/**
 * Ends a call that is still up, triggered from somewhere other than the
 * softphone widget that placed it.
 *
 * The call must already be known locally, both to avoid letting an
 * authenticated-but-arbitrary caller terminate any call on the account by
 * guessing a `callUuid`, and because the auth token needed to reach Plivo at
 * all lives on the integration the session row already points at.
 */
const requireOwnCall = async (
  models: IContext['models'],
  integrationId: string,
  callUuid: string,
) => {
  const integration = await models.PlivoIntegrations.getIntegration({
    erxesApiId: integrationId,
  });

  await models.PlivoCallSessions.getCallSession({
    callUuid,
    integrationId: integration.erxesApiId,
  });

  return integration;
};

export const plivoMutations = {
  /**
   * Places an outbound call without going through the softphone widget:
   * rings the requesting agent's own SIP endpoint first, then bridges them to
   * `to` once they pick up. See {@link handlePlivoClickToCall} for the full
   * mechanics and its scoping limits — in particular, this only reaches the
   * agent while their softphone widget is mounted and registered.
   *
   * Exists for exactly the callers who cannot use the widget's own dial
   * button: a phone icon on a contact row, an automation, or another plugin
   * acting on an agent's behalf. An agent already looking at the widget should
   * keep using it directly — that path has no extra hop.
   *
   * No `wrapperConfig`, matching every other resolver in this module: the
   * plugin's Apollo wrapper applies `wrapPermission` and rejects an
   * unauthenticated caller before the body runs. `user._id` is also checked
   * explicitly because it is what the call is attributed to in history.
   */
  plivoClickToCall: async (
    _root: undefined,
    {
      integrationId,
      to,
      callerName,
    }: { integrationId: string; to: string; callerName?: string },
    { models, subdomain, user }: IContext,
  ): Promise<{ requestUuid: string }> => {
    if (!user?._id) {
      throw new Error('Login required');
    }

    return await handlePlivoClickToCall(models, subdomain, {
      integrationId,
      userId: user._id,
      to,
      callerName,
    });
  },

  /**
   * Ends a live call from outside the softphone widget — the widget itself
   * ends its own calls through the SDK directly and has no need of this.
   *
   * Not restricted to the call's own `userId`: `plivoCallHistories` already
   * shows every call on the account to any logged-in user, on the basis that
   * call history is a team-visible log rather than a private one, and ending
   * a call a colleague placed (a supervisor stepping in) is consistent with
   * that same trust level rather than a wider one.
   */
  plivoEndCall: async (
    _root: undefined,
    { integrationId, callUuid }: { integrationId: string; callUuid: string },
    { models, user }: IContext,
  ): Promise<{ callUuid: string }> => {
    if (!user?._id) {
      throw new Error('Login required');
    }

    const integration = await requireOwnCall(models, integrationId, callUuid);

    try {
      await hangupPlivoCall({
        authId: integration.authId,
        authToken: integration.authToken,
        callUuid,
      });
    } catch (e) {
      if (e instanceof PlivoApiError && e.isAuthError) {
        await models.PlivoIntegrations.updateOne(
          { erxesApiId: integrationId },
          { $set: { healthStatus: 'error', error: e.message } },
        ).catch(() => undefined);
      }

      throw e;
    }

    return { callUuid };
  },

  /**
   * Blind-transfers a live call to another number.
   *
   * Blind, not attended: the caller is moved and the agent's leg is released,
   * with no announcement to whoever picks up. Attended transfer would need the
   * agent to hold a third leg and swap between them, which Plivo can do but
   * which needs its own UI to be worth anything — a half-built attended
   * transfer that drops the caller when the agent misclicks is worse than a
   * blind one that works.
   *
   * `legs: 'aleg'` is what makes it the CALLER who moves. Redirecting the
   * agent's leg instead would send the agent to the destination and leave the
   * customer holding a dead line.
   */
  plivoTransferCall: async (
    _root: undefined,
    {
      integrationId,
      callUuid,
      to,
    }: { integrationId: string; callUuid: string; to: string },
    { models, subdomain, user }: IContext,
  ): Promise<{ callUuid: string }> => {
    if (!user?._id) {
      throw new Error('Login required');
    }

    const integration = await requireOwnCall(models, integrationId, callUuid);

    const destination = normalizePhone(to, integration.defaultCountryCode);

    // Validated here rather than left to the redirect: an unusable number would
    // otherwise move the caller to XML that can only apologise and hang up,
    // having already released the agent — the call would be lost to fix a typo.
    if (!destination) {
      throw new Error(`Cannot transfer to an unusable number: ${to}`);
    }

    const answerUrl =
      `${getPlivoCallbackBaseUrl(subdomain)}/answer` +
      `?TransferTo=${encodeURIComponent(destination)}`;

    try {
      await transferPlivoCall({
        authId: integration.authId,
        authToken: integration.authToken,
        callUuid,
        answerUrl,
      });
    } catch (e) {
      if (e instanceof PlivoApiError && e.isAuthError) {
        await models.PlivoIntegrations.updateOne(
          { erxesApiId: integrationId },
          { $set: { healthStatus: 'error', error: e.message } },
        ).catch(() => undefined);
      }

      throw e;
    }

    return { callUuid };
  },

  /**
   * Sets where the calling agent should be rung.
   *
   * Only ever the caller's own settings. There is deliberately no `userId`
   * argument: the handset is a personal number, and letting one agent write
   * another's would both leak it and let somebody route a colleague's calls to
   * a phone of their choosing.
   *
   * Written onto the endpoint credential row rather than a collection of its
   * own — that row is already one-per-agent-per-integration with a unique
   * index, so the upsert here cannot produce a duplicate.
   */
  plivoSaveAgentRouting: async (
    _root: undefined,
    {
      integrationId,
      device,
      phoneNumber,
      available,
    }: {
      integrationId: string;
      device: string;
      phoneNumber?: string;
      available?: boolean;
    },
    { models, user }: IContext,
  ) => {
    if (!user?._id) {
      throw new Error('Login required');
    }

    if (device !== 'browser' && device !== 'phone' && device !== 'both') {
      throw new Error('Ring me on must be browser, phone or both');
    }

    const integration = await models.PlivoIntegrations.getIntegration({
      erxesApiId: integrationId,
    });

    let normalized: string | undefined;

    if (device === 'phone' || device === 'both') {
      normalized =
        normalizePhone(phoneNumber || '', integration.defaultCountryCode) ||
        undefined;

      // Refused rather than saved half-configured: an agent who picks `phone`
      // with an unusable number would simply stop receiving calls, with
      // nothing on screen saying why.
      if (!normalized) {
        throw new Error(
          'Add a phone number to ring, or choose the browser softphone instead.',
        );
      }
    }

    await models.PlivoEndpointCredentials.updateOne(
      { integrationId, userId: user._id },
      {
        $set: {
          device,
          // Cleared when going back to browser-only, so a stale number cannot
          // start ringing again if the agent later re-enables the handset.
          phoneNumber: normalized || '',
          available: available !== false,
          updatedAt: new Date(),
        },
        $setOnInsert: { integrationId, userId: user._id, createdAt: new Date() },
      },
      { upsert: true },
    );

    return {
      integrationId,
      device,
      phoneNumber: normalized || null,
      available: available !== false,
    };
  },
};
