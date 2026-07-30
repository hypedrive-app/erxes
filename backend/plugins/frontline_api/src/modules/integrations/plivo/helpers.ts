import { normalizePhone } from 'erxes-api-shared/utils';
import { generateModels } from '~/connectionResolvers';
import { getPlivoAccount } from '@/integrations/plivo/utils';
import { debugError } from '@/integrations/plivo/debuggers';
import { IPlivoIntegration } from '@/integrations/plivo/@types';

interface IPlivoIntegrationConfig {
  authId?: string;
  authToken?: string;
  plivoPhoneNumber?: string;
  appId?: string;
  defaultCountryCode?: string;
  recordCalls?: boolean;
}

const parseConfig = (data: string): IPlivoIntegrationConfig => {
  try {
    return JSON.parse(data || '{}');
  } catch (e) {
    throw new Error(`Invalid payload format: ${e.message}`);
  }
};

/**
 * Confirms the credentials work before the integration is stored, so a typo in
 * the auth token surfaces immediately in the connect form rather than as calls
 * that silently never connect. Reading the account back is the cheapest call
 * that exercises Basic auth.
 */
const verifyCredentials = async (authId: string, authToken: string) => {
  try {
    return await getPlivoAccount({ authId, authToken });
  } catch (e) {
    throw new Error(
      `Could not reach Plivo with these credentials: ${e.message}`,
    );
  }
};

/**
 * Creates the plugin-local integration once the inbox has created its own.
 *
 * The rented number is the routing key for every inbound callback, so a second
 * integration claiming it would make delivery ambiguous; that is rejected up
 * front with a message naming the conflict rather than left to the unique index
 * to surface as an opaque write error.
 */
export const plivoCreateIntegration = async (
  subdomain: string,
  { integrationId, data, kind },
): Promise<{ status: 'success' }> => {
  const models = await generateModels(subdomain);

  const {
    authId,
    authToken,
    plivoPhoneNumber,
    appId,
    defaultCountryCode,
    recordCalls,
  } = parseConfig(data);

  if (!authId || !authToken || !plivoPhoneNumber) {
    throw new Error(
      'An auth ID, auth token and Plivo phone number are required to connect Plivo',
    );
  }

  // Stored normalised so it matches the `To`/`From` a callback carries, which
  // Plivo always sends in E.164.
  const phoneNumber = normalizePhone(plivoPhoneNumber, defaultCountryCode);

  if (!phoneNumber) {
    throw new Error(`Not a usable phone number: ${plivoPhoneNumber}`);
  }

  const duplicate = await models.PlivoIntegrations.findOne({
    plivoPhoneNumber: phoneNumber,
  });

  if (duplicate) {
    throw new Error(
      'This Plivo phone number is already connected to another integration',
    );
  }

  await verifyCredentials(authId, authToken);

  const doc: IPlivoIntegration = {
    kind,
    erxesApiId: integrationId,
    authId,
    authToken,
    plivoPhoneNumber: phoneNumber,
    appId,
    defaultCountryCode,
    recordCalls,
    healthStatus: 'healthy',
  };

  await models.PlivoIntegrations.create(doc);

  return { status: 'success' };
};

export const plivoUpdateIntegration = async (
  subdomain: string,
  integrationId: string,
  data: string,
) => {
  const models = await generateModels(subdomain);

  const integration = await models.PlivoIntegrations.getIntegration({
    erxesApiId: integrationId,
  });

  const config = parseConfig(data);

  const authId = config.authId || integration.authId;
  const authToken = config.authToken || integration.authToken;
  const defaultCountryCode =
    config.defaultCountryCode || integration.defaultCountryCode;

  const plivoPhoneNumber = config.plivoPhoneNumber
    ? normalizePhone(config.plivoPhoneNumber, defaultCountryCode)
    : integration.plivoPhoneNumber;

  if (!plivoPhoneNumber) {
    throw new Error(`Not a usable phone number: ${config.plivoPhoneNumber}`);
  }

  if (plivoPhoneNumber !== integration.plivoPhoneNumber) {
    const duplicate = await models.PlivoIntegrations.findOne({
      plivoPhoneNumber,
      erxesApiId: { $ne: integrationId },
    });

    if (duplicate) {
      throw new Error(
        'This Plivo phone number is already connected to another integration',
      );
    }
  }

  await verifyCredentials(authId, authToken);

  // Only the fields this form owns are written. `config` is parsed from a
  // caller-supplied JSON string, so spreading it whole would let an unexpected
  // key — `erxesApiId` or `kind` — overwrite the identity of the integration.
  await models.PlivoIntegrations.updateOne(
    { erxesApiId: integrationId },
    {
      $set: {
        authId,
        authToken,
        plivoPhoneNumber,
        defaultCountryCode,
        appId: config.appId ?? integration.appId,
        recordCalls: config.recordCalls ?? integration.recordCalls,
        // Credentials were just proven to work; clear any prior failure.
        healthStatus: 'healthy',
        error: '',
      },
    },
  );

  return { status: 'success' };
};

/**
 * Revalidates stored credentials and clears the error state when they work.
 *
 * A rotated auth token is the usual way a Plivo integration breaks, so
 * repairing means proving the credentials again — there is no subscription to
 * re-establish as there is for the Meta channels.
 */
export const plivoRepairIntegration = async (
  subdomain: string,
  integrationId: string,
) => {
  const models = await generateModels(subdomain);

  const integration = await models.PlivoIntegrations.getIntegration({
    erxesApiId: integrationId,
  });

  try {
    await verifyCredentials(integration.authId, integration.authToken);

    await models.PlivoIntegrations.updateOne(
      { erxesApiId: integrationId },
      { $set: { healthStatus: 'healthy', error: '' } },
    );

    return { status: 'success' };
  } catch (e) {
    // Record why it is still broken so the settings screen can show it.
    await models.PlivoIntegrations.updateOne(
      { erxesApiId: integrationId },
      { $set: { healthStatus: 'error', error: e.message } },
    );

    throw e;
  }
};

export const plivoRemoveIntegration = async (
  subdomain: string,
  integrationId: string,
) => {
  const models = await generateModels(subdomain);

  const integration = await models.PlivoIntegrations.findOne({
    erxesApiId: integrationId,
  });

  if (!integration) {
    return { status: 'success' };
  }

  try {
    await models.PlivoCallSessions.deleteMany({
      integrationId: integration.erxesApiId,
    });
    await models.PlivoCustomers.deleteMany({
      integrationId: integration.erxesApiId,
    });
  } catch (e) {
    // The integration itself must still go, otherwise the number stays claimed
    // by the unique index and cannot be reconnected.
    debugError(
      `Failed to fully clean up Plivo integration ${integrationId}: ${e.message}`,
    );
  }

  await models.PlivoIntegrations.deleteOne({ _id: integration._id });

  return { status: 'success' };
};
