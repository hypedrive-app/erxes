import { normalizePhone } from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';
import { getPlivoCallbackBaseUrl } from '@/integrations/plivo/callbackUrl';
import { ensurePlivoEndpoint } from '@/integrations/plivo/helpers';
import { PLIVO_ENDPOINT_DOMAIN } from '@/integrations/plivo/constants';
import {
  createPlivoCall,
  hangupPlivoCall,
  PlivoApiError,
} from '@/integrations/plivo/utils';

/**
 * Places a server-initiated outbound call, ringing the requesting agent first
 * and bridging them to the customer once they pick up.
 *
 * This is Plivo's own documented click-to-call shape — `to` receives the FIRST
 * leg, and that leg's `answer_url` is where the bridge to the second party is
 * built (https://www.plivo.com/docs/voice/use-cases/connect-call-to-second-person).
 * `from` must be a number the account owns, so it is always the integration's
 * rented line; the customer is never dialled directly from here.
 *
 * The agent has no stored phone number anywhere in this product — the only
 * thing that identifies them to Plivo is the SIP endpoint their browser
 * softphone registers on, so that endpoint IS the first leg, provisioned via
 * `ensurePlivoEndpoint` exactly as `plivoSoftphoneCredentials` does. Ringing it
 * therefore only reaches the agent while their softphone widget is mounted and
 * registered — there is no desk phone or mobile number to fall back to. That
 * is a real scoping limit, not a bug: it makes this useful for triggering a
 * call from somewhere the widget's own dial button is not available (a contact
 * list row, an automation), while the widget is open — not a way to reach an
 * agent who is fully logged out.
 *
 * The destination cannot be handed to Plivo as an extra POST field on the
 * agent leg's `/Call/` request — that field would describe the FIRST leg, not
 * the one to bridge to afterwards — so it rides on the answer callback's own
 * URL instead, which `parseCallbackParams` reads back out on the other side of
 * the round trip.
 *
 * Nothing is stored here: Plivo returns a request uuid, not the CallUUID, and
 * the row keyed by CallUUID is written by the answer callback. Writing a
 * placeholder now would need reconciling against that callback and could leave
 * an orphan row whenever a call is never actually created.
 */
export const handlePlivoClickToCall = async (
  models: IModels,
  subdomain: string,
  data: { integrationId: string; userId: string; to: string; callerName?: string },
): Promise<{ requestUuid: string }> => {
  const { integrationId, userId, to, callerName } = data;

  const integration = await models.PlivoIntegrations.getIntegration({
    erxesApiId: integrationId,
  });

  const destination = normalizePhone(to, integration.defaultCountryCode);

  if (!destination) {
    throw new Error(`Cannot call an unusable number: ${to}`);
  }

  if (!integration.authId || !integration.authToken) {
    throw new Error(
      'This Plivo integration has no credentials stored. Reconnect it before calling from here.',
    );
  }

  // Same endpoint the softphone widget registers, provisioned the same way —
  // there is deliberately only ever one per agent per integration, so ringing
  // it here rings the same place `plivoSoftphoneCredentials` already does.
  const endpoint = await ensurePlivoEndpoint({
    models,
    authId: integration.authId,
    authToken: integration.authToken,
    integrationId,
    userId,
    appId: integration.appId,
  });

  const baseUrl = getPlivoCallbackBaseUrl(subdomain);

  const answerUrl =
    `${baseUrl}/answer` +
    `?ClickToCallTo=${encodeURIComponent(destination)}` +
    `&ClickToCallUserId=${encodeURIComponent(userId)}`;

  try {
    const requestUuid = await createPlivoCall({
      authId: integration.authId,
      authToken: integration.authToken,
      from: integration.plivoPhoneNumber,
      to: `sip:${endpoint.username}@${PLIVO_ENDPOINT_DOMAIN}`,
      answerUrl,
      hangupUrl: `${baseUrl}/hangup`,
      callerName,
    });

    return { requestUuid };
  } catch (e) {
    // A rotated or revoked auth token otherwise fails every click-to-call
    // silently: `PlivoApiError.isAuthError` was computed on every REST failure
    // and never read anywhere, so `healthStatus` stayed 'healthy' — set only
    // by connect/repair — through any number of failed outbound calls. Rate
    // limits and transient 5xx are deliberately left alone: they say nothing
    // about whether the integration itself is broken.
    if (e instanceof PlivoApiError && e.isAuthError) {
      await models.PlivoIntegrations.updateOne(
        { erxesApiId: integrationId },
        { $set: { healthStatus: 'error', error: e.message } },
      ).catch(() => undefined);
    }

    throw e;
  }
};

/**
 * Ends a call that is still up, from the inbox.
 *
 * The call must already be known locally: hanging up by a CallUUID we never
 * registered would let any caller terminate an arbitrary call on the account.
 */
export const handlePlivoHangup = async (
  models: IModels,
  data: { integrationId: string; callUuid: string },
): Promise<{ callUuid: string }> => {
  const { integrationId, callUuid } = data;

  const integration = await models.PlivoIntegrations.getIntegration({
    erxesApiId: integrationId,
  });

  await models.PlivoCallSessions.getCallSession({
    callUuid,
    integrationId: integration.erxesApiId,
  });

  try {
    await hangupPlivoCall({
      authId: integration.authId,
      authToken: integration.authToken,
      callUuid,
    });
  } catch (e) {
    // Mirrors `plivoEndCall` and `handlePlivoClickToCall`: a dead token is
    // otherwise invisible until some OTHER action happens to hit the same
    // failure, so the settings screen keeps calling the integration healthy
    // while every hangup from the inbox fails. Rate limits and transient codes
    // are deliberately left alone — they are not evidence the credentials are
    // broken, and flapping the status on a throttle would make the screen
    // noise rather than signal.
    if (e instanceof PlivoApiError && e.isAuthError) {
      await models.PlivoIntegrations.updateOne(
        { erxesApiId: integrationId },
        { $set: { healthStatus: 'error', error: e.message } },
      ).catch(() => undefined);
    }

    throw e;
  }

  return { callUuid };
};
