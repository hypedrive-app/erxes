import { randomBytes } from 'crypto';
import { normalizePhone } from 'erxes-api-shared/utils';
import { generateModels, IModels } from '~/connectionResolvers';
import {
  buildPlivoNumberSelector,
  createPlivoEndpoint,
  findPlivoEndpointByAlias,
  getPlivoAccount,
  listPlivoEndpoints,
  toDialDigits,
  updatePlivoEndpointPassword,
} from '@/integrations/plivo/utils';
import { debugError } from '@/integrations/plivo/debuggers';
import {
  IPlivoEndpointCredentials,
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

  // Compared on digits, not on the exact string: a number already connected as
  // `918035396691` is the same rented line as `+918035396691` and must not be
  // claimed twice, or an inbound callback could match either integration.
  const duplicate = await models.PlivoIntegrations.findOne({
    plivoPhoneNumber: buildPlivoNumberSelector([phoneNumber]),
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

  // Digits, so merely re-saving the form with the same line written differently
  // (`918035396691` vs `+918035396691`) is not mistaken for a number change and
  // does not run a duplicate check against the integration's own current row.
  if (
    toDialDigits(plivoPhoneNumber) !== toDialDigits(integration.plivoPhoneNumber)
  ) {
    const duplicate = await models.PlivoIntegrations.findOne({
      plivoPhoneNumber: buildPlivoNumberSelector([plivoPhoneNumber]),
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
    // Live SIP passwords for a number nobody can call any more. They are of no
    // further use and must not outlive the integration that scoped them.
    await models.PlivoEndpointCredentials.deleteMany({
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
 * Everywhere an inbound call should ring, for one integration.
 *
 * Reachability on the BROWSER is read from Plivo rather than tracked locally.
 * Plivo's endpoint list returns `sip_registered`, which is the registrar's own
 * live view of whether a client holds a registration right now. That beats a DB
 * flag written from the browser's `onLogin`/`onLogout`, which goes stale on
 * exactly the failures that matter: a closed laptop, a killed tab or a dropped
 * network never sends `onLogout`, so a DB-tracked agent would keep absorbing
 * calls into a dead endpoint.
 *
 * Registration alone is NOT the whole answer, which is why this reads the
 * agent's own preferences too. It cannot express an agent at lunch with the tab
 * still open, an agent already on another call, or — the case that motivated
 * this — an agent whose network carries the signalling but drops the audio, so
 * the call rings, is answered, and is silent. Those agents were rung anyway.
 *
 * An endpoint whose `sip_registered` is absent is treated as NOT reachable. The
 * cost of the two mistakes is asymmetric — ringing a dead endpoint burns the
 * whole agent stage and delays the caller, while skipping a live one still
 * reaches them via the fallback number and voicemail.
 *
 * Never throws: if Plivo cannot be reached the caller must still be handled, so
 * an empty result is returned and routing falls through to the next stage.
 */
export const getReachableAgentTargets = async ({
  models,
  authId,
  authToken,
  integrationId,
  defaultCountryCode,
}: {
  models: IModels;
  authId: string;
  authToken: string;
  integrationId: string;
  defaultCountryCode?: string;
}): Promise<{ usernames: string[]; phoneNumbers: string[] }> => {
  const empty = { usernames: [], phoneNumbers: [] };

  try {
    const preferences = await models.PlivoEndpointCredentials.find({
      integrationId,
    }).lean();

    // Agents already on a call are excluded outright. Ringing somebody
    // mid-conversation puts a second call in their ear and, on the browser,
    // is refused by `allowMultipleIncomingCalls: false` anyway — so the leg
    // is spent and the caller waits out the whole agent stage for nothing.
    const busyUserIds = new Set(
      (
        await models.PlivoCallSessions.find(
          { integrationId, endedAt: { $exists: false }, userId: { $exists: true } },
          { userId: 1 },
        ).lean()
      )
        .map((session) => session.userId)
        .filter(Boolean) as string[],
    );

    // Absent preferences mean the prior behaviour: ring the browser. Nobody
    // stops receiving calls because these fields were added.
    const byUserId = new Map(
      preferences.map((preference) => [preference.userId, preference]),
    );

    const wants = (userId: string | undefined, target: 'browser' | 'phone') => {
      if (!userId || busyUserIds.has(userId)) {
        return false;
      }

      const preference = byUserId.get(userId);

      if (preference?.available === false) {
        return false;
      }

      const device = preference?.device || 'browser';

      return device === 'both' || device === target;
    };

    const endpoints = await listPlivoEndpoints({ authId, authToken });
    const prefix = buildPlivoEndpointAliasPrefix(integrationId);

    // The alias is the only thing tying a Plivo endpoint back to one of our
    // agents, so the username is matched through it rather than assumed.
    const userIdByUsername = new Map(
      preferences.map((preference) => [preference.username, preference.userId]),
    );

    const usernames = endpoints
      .filter(
        (endpoint) =>
          endpoint.sipRegistered === true &&
          endpoint.username &&
          endpoint.alias.startsWith(prefix) &&
          wants(userIdByUsername.get(endpoint.username), 'browser'),
      )
      .map((endpoint) => endpoint.username);

    // A handset needs no registration — that is the point of it — so these are
    // read straight from the preferences rather than from Plivo's endpoint list.
    const phoneNumbers = preferences
      .filter((preference) => wants(preference.userId, 'phone'))
      .map((preference) =>
        normalizePhone(preference.phoneNumber || '', defaultCountryCode),
      )
      .filter((value): value is string => !!value);

    return { usernames, phoneNumbers: [...new Set(phoneNumbers)] };
  } catch (e: any) {
    debugError(
      `Could not resolve Plivo ring targets for ${integrationId}, ` +
        `routing without agents: ${e.message}`,
    );

    return empty;
  }
};

/**
 * A password Plivo will accept on a SIP endpoint.
 *
 * Hex keeps it inside the alphanumeric set Plivo documents for endpoint
 * passwords, so nothing has to be escaped on the way to the SIP registrar.
 */
const generateEndpointPassword = (): string => randomBytes(24).toString('hex');

/**
 * Returns the SIP endpoint for one agent WITH the password it registers with,
 * creating or rotating as needed.
 *
 * A browser is not reachable without an endpoint: `<Dial><User>` can only ring
 * one that exists. The endpoint is therefore provisioned on demand and looked
 * up by alias on every later call, because Plivo's generated username is not
 * derivable.
 *
 * The password must be persisted, which is the opposite of what this function
 * used to do. JWT registration is refused by Plivo's registrar for this account
 * — a server-minted token from Plivo's own JWT API and a locally-signed one both
 * fail with `SIP Failure Code` on an endpoint where
 * `client.login(username, password)` succeeds at the same moment — so the
 * browser authenticates with the password instead, and a password that was
 * discarded at creation can never be recovered: Plivo's `GET /Endpoint/{id}/`
 * returns a STALE value that does not authenticate.
 *
 * There are three cases:
 *
 * 1. No endpoint at Plivo — create one, store what we set.
 * 2. Endpoint exists and we hold its password — return both, no API write.
 * 3. Endpoint exists but we hold NO password (every endpoint provisioned before
 *    this change) — its real password is unknown and unreadable, so it is
 *    ROTATED: a fresh one is POSTed and stored. This is the only way to make a
 *    legacy endpoint usable again.
 *
 * Rotation invalidates any client still registered on that endpoint with the
 * old password — a desk phone or another browser would be dropped and would not
 * re-register. That is accepted: those endpoints are ours, provisioned for this
 * agent's softphone alone, and the alternative is an endpoint nobody can ever
 * log into.
 */
export const ensurePlivoEndpoint = async ({
  models,
  authId,
  authToken,
  integrationId,
  userId,
  appId,
}: {
  models: IModels;
  authId: string;
  authToken: string;
  integrationId: string;
  userId: string;
  appId?: string;
}): Promise<IPlivoEndpointCredentials> => {
  const alias = buildPlivoEndpointAlias(integrationId, userId);

  const existing = await findPlivoEndpointByAlias({
    authId,
    authToken,
    alias,
  });

  if (existing?.username) {
    const stored = await models.PlivoEndpointCredentials.findOne({
      integrationId,
      userId,
    }).lean();

    // The stored row must match the endpoint that is actually at Plivo. An
    // endpoint deleted and re-provisioned in the console keeps the alias but
    // gets a NEW username, and registering the old one would fail on an
    // identity that no longer exists.
    if (stored?.password && stored.username === existing.username) {
      return { ...existing, password: stored.password };
    }

    // Case 3: rotate. See the note above on what this breaks.
    const password = generateEndpointPassword();

    await updatePlivoEndpointPassword({
      authId,
      authToken,
      endpointId: existing.endpointId,
      password,
    });

    await models.PlivoEndpointCredentials.storeCredential({
      integrationId,
      userId,
      endpointId: existing.endpointId,
      username: existing.username,
      alias: existing.alias,
      password,
    });

    return { ...existing, password };
  }

  const password = generateEndpointPassword();

  const created = await createPlivoEndpoint({
    authId,
    authToken,
    username: buildPlivoEndpointUsernameStem(userId),
    password,
    alias,
    appId,
  });

  await models.PlivoEndpointCredentials.storeCredential({
    integrationId,
    userId,
    endpointId: created.endpointId,
    username: created.username,
    alias: created.alias,
    password,
  });

  return { ...created, password };
};
