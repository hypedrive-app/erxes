import { getEnv, normalizePhone } from 'erxes-api-shared/utils';
import { IModels } from '~/connectionResolvers';
import { createPlivoCall, hangupPlivoCall } from '@/integrations/plivo/utils';

/**
 * Base URL Plivo calls back on.
 *
 * It has to be the address Plivo can reach from the public internet, and it
 * must match what the signature is computed over — the digest covers the full
 * URL, so a value that disagrees with the deployed hostname makes every
 * callback fail verification rather than fail loudly here.
 */
const getCallbackBaseUrl = (subdomain: string): string => {
  const domain = getEnv({ name: 'DOMAIN', subdomain, defaultValue: '' });

  if (!domain) {
    throw new Error(
      'DOMAIN must be configured so Plivo can reach the call webhooks',
    );
  }

  // The gateway prefix is only present in a deployed stack; outside production
  // the plugin is addressed directly. Mirrors the instagram module.
  const prefix =
    process.env.NODE_ENV === 'production' ? '/gateway/pl:frontline' : '/pl:frontline';

  return `${domain.replace(/\/$/, '')}${prefix}/plivo`;
};

/**
 * Places an outbound call from the inbox.
 *
 * Nothing is stored here: Plivo returns a request uuid, not the CallUUID, and
 * the row keyed by CallUUID is written by the answer callback. Writing a
 * placeholder now would need reconciling against that callback and could leave
 * an orphan row whenever a call is never actually created.
 */
export const handlePlivoCall = async (
  models: IModels,
  subdomain: string,
  data: { integrationId: string; to: string; callerName?: string },
): Promise<{ requestUuid: string }> => {
  const { integrationId, to, callerName } = data;

  const integration = await models.PlivoIntegrations.getIntegration({
    erxesApiId: integrationId,
  });

  const destination = normalizePhone(to, integration.defaultCountryCode);

  if (!destination) {
    throw new Error(`Cannot call an unusable number: ${to}`);
  }

  const baseUrl = getCallbackBaseUrl(subdomain);

  const requestUuid = await createPlivoCall({
    authId: integration.authId,
    authToken: integration.authToken,
    from: integration.plivoPhoneNumber,
    to: destination,
    answerUrl: `${baseUrl}/answer`,
    hangupUrl: `${baseUrl}/hangup`,
    callerName,
  });

  return { requestUuid };
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

  await hangupPlivoCall({
    authId: integration.authId,
    authToken: integration.authToken,
    callUuid,
  });

  return { callUuid };
};
