import { randomBytes } from 'crypto';
import { normalizePhone } from 'erxes-api-shared/utils';
import { generateModels } from '~/connectionResolvers';
import {
  createPlivoEndpoint,
  findPlivoEndpointByAlias,
  getPlivoAccount,
  listPlivoEndpoints,
} from '@/integrations/plivo/utils';
import { debugError } from '@/integrations/plivo/debuggers';
import {
  IPlivoEndpoint,
  IPlivoIntegration,
} from '@/integrations/plivo/@types';

interface IPlivoIntegrationConfig {
  authId?: string;
  authToken?: string;
  plivoPhoneNumber?: string;
  appId?: string;
  defaultCountryCode?: string;
  recordCalls?: boolean;
  forwardToNumber?: string;
  forwardTimeout?: number;
  ringAgents?: boolean;
  agentRingTimeout?: number;
  voicemailEnabled?: boolean;
  voicemailMaxLength?: number;
  voicemailGreeting?: string;
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
    forwardToNumber,
    forwardTimeout,
    ringAgents,
    agentRingTimeout,
    voicemailEnabled,
    voicemailMaxLength,
    voicemailGreeting,
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
    forwardToNumber,
    forwardTimeout,
    ringAgents,
    agentRingTimeout,
    voicemailEnabled,
    voicemailMaxLength,
    voicemailGreeting,
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
        // Inbound routing. Each falls back to the stored value so a form that
        // posts only part of the config cannot silently reset the rest.
        forwardToNumber: config.forwardToNumber ?? integration.forwardToNumber,
        forwardTimeout: config.forwardTimeout ?? integration.forwardTimeout,
        ringAgents: config.ringAgents ?? integration.ringAgents,
        agentRingTimeout:
          config.agentRingTimeout ?? integration.agentRingTimeout,
        voicemailEnabled:
          config.voicemailEnabled ?? integration.voicemailEnabled,
        voicemailMaxLength:
          config.voicemailMaxLength ?? integration.voicemailMaxLength,
        voicemailGreeting:
          config.voicemailGreeting ?? integration.voicemailGreeting,
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

/**
 * Stable identity of the SIP endpoint belonging to one agent on one
 * integration.
 *
 * This is the endpoint's ALIAS, not its username. Plivo appends a 12-digit
 * number to whatever username it is given, so a username cannot be derived and
 * relied upon — but the alias is stored verbatim, which makes it the only field
 * that can identify an endpoint we provisioned earlier.
 *
 * Scoped by integration so an agent working two numbers gets two endpoints
 * rather than one registration stealing the other's calls. Aliases allow
 * letters, digits, hyphens and underscores.
 * https://www.plivo.com/docs/voice/api/endpoints
 */
export const buildPlivoEndpointAlias = (
  integrationId: string,
  userId: string,
): string => {
  const safe = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '');

  return `erxes_${safe(integrationId)}_${safe(userId)}`;
};

/**
 * The username requested when creating an endpoint.
 *
 * Plivo requires alphanumeric only, 1-25 characters, starting with a letter,
 * and then appends a 12-digit number of its own — so this only has to be a
 * valid, collision-tolerant stem. The agent's id is truncated to keep the
 * requested name inside the limit; uniqueness comes from Plivo's suffix, and
 * the alias is what we match on afterwards.
 */
export const buildPlivoEndpointUsernameStem = (userId: string): string =>
  `erxes${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`;

/**
 * Alias prefix shared by every endpoint provisioned for one integration.
 *
 * `buildPlivoEndpointAlias` composes `erxes_<integration>_<user>`, so the stem
 * without the user segment selects exactly this integration's endpoints out of
 * an account-wide list — including endpoints belonging to other Plivo numbers,
 * which must never be rung for this one.
 */
export const buildPlivoEndpointAliasPrefix = (integrationId: string): string =>
  `erxes_${integrationId.replace(/[^a-zA-Z0-9]/g, '')}_`;

/**
 * The SIP usernames of agents currently reachable on their browser softphone.
 *
 * Reachability is read from Plivo rather than tracked locally. Plivo's endpoint
 * list returns `sip_registered`, which is the registrar's own live view of
 * whether a client holds a SIP registration right now — the same fact the
 * console shows. That beats a DB flag written from the browser's `onLogin`/
 * `onLogout`, which goes stale on exactly the failures that matter: a closed
 * laptop, a killed tab or a dropped network never sends `onLogout`, so a
 * DB-tracked agent would keep absorbing calls into a dead endpoint.
 *
 * An endpoint whose `sip_registered` is absent is treated as NOT reachable. The
 * cost of the two mistakes is asymmetric — ringing a dead endpoint burns the
 * whole agent stage and delays the caller, while skipping a live one still
 * reaches them via the fallback number and voicemail.
 *
 * Never throws: if Plivo cannot be reached the caller must still be handled, so
 * an empty list is returned and routing falls through to the next stage.
 */
export const getReachableAgentEndpoints = async ({
  authId,
  authToken,
  integrationId,
}: {
  authId: string;
  authToken: string;
  integrationId: string;
}): Promise<string[]> => {
  try {
    const endpoints = await listPlivoEndpoints({ authId, authToken });
    const prefix = buildPlivoEndpointAliasPrefix(integrationId);

    return endpoints
      .filter(
        (endpoint) =>
          endpoint.sipRegistered === true &&
          endpoint.username &&
          endpoint.alias.startsWith(prefix),
      )
      .map((endpoint) => endpoint.username);
  } catch (e: any) {
    debugError(
      `Could not read Plivo endpoint registrations for ${integrationId}, ` +
        `routing without agents: ${e.message}`,
    );

    return [];
  }
};

/**
 * Returns the SIP endpoint for one agent, creating it the first time.
 *
 * A JWT alone does not make a browser reachable: `<Dial><User>` can only ring a
 * SIP endpoint that exists, and registration fails without one. The endpoint is
 * therefore provisioned on demand and looked up by alias on every later call,
 * because Plivo's generated username is not derivable.
 *
 * The generated password is never stored or returned — the browser authenticates
 * with the access token, so the password only has to exist to satisfy the API.
 */
export const ensurePlivoEndpoint = async ({
  authId,
  authToken,
  integrationId,
  userId,
  appId,
}: {
  authId: string;
  authToken: string;
  integrationId: string;
  userId: string;
  appId?: string;
}): Promise<IPlivoEndpoint> => {
  const alias = buildPlivoEndpointAlias(integrationId, userId);

  const existing = await findPlivoEndpointByAlias({
    authId,
    authToken,
    alias,
  });

  if (existing?.username) {
    return existing;
  }

  return await createPlivoEndpoint({
    authId,
    authToken,
    username: buildPlivoEndpointUsernameStem(userId),
    password: randomBytes(24).toString('hex'),
    alias,
    appId,
  });
};
