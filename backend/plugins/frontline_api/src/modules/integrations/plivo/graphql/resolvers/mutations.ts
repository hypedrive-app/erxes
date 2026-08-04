import { IContext } from '~/connectionResolvers';
import { handlePlivoClickToCall } from '@/integrations/plivo/handlePlivoCall';
import { hangupPlivoCall, PlivoApiError } from '@/integrations/plivo/utils';

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
};
