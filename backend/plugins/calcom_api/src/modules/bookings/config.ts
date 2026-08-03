import { getEnv } from 'erxes-api-shared/utils';

import { IModels } from '~/connectionResolvers';

/**
 * Config resolution for the Cal.com integration.
 *
 * erxes' convention is DB-first with an env fallback — frontline's
 * getConfig (modules/integrations/instagram/commonUtils.ts) and core's
 * readConfigValue both resolve `configs[CODE] ?? env[CODE]`. This plugin was
 * originally env-only, which broke that convention in a way that matters
 * operationally: an env-only key can only be changed by editing Dokploy and
 * redeploying the whole stack, so rotating a leaked Cal.com key means a full
 * rebuild rather than a form submission.
 *
 * DB wins over env deliberately. env is the deployment's default; a value set
 * in the UI is a later, more specific decision by an operator and must not be
 * silently overridden by the container's environment.
 */

export const CALCOM_CONFIG_CODES = [
  'CALCOM_API_KEY',
  'CALCOM_API_URL',
  'CALCOM_WEBHOOK_SECRET',
  'CALCOM_ADMIN_TOKEN',
  'CALCOM_CREATE_MISSING_CONTACTS',
] as const;

export type CalcomConfigCode = (typeof CALCOM_CONFIG_CODES)[number];

/**
 * Reads one config value, preferring the stored value over the environment.
 *
 * `models` is optional because the webhook receiver resolves the signing secret
 * before it has decided which subdomain — and therefore which models — the
 * delivery belongs to. Without models this degrades to env, which is exactly
 * the behaviour frontline's getConfig has for the same situation.
 */
export const getCalcomConfig = async (
  models: IModels | undefined,
  code: CalcomConfigCode,
  defaultValue?: string,
): Promise<string | undefined> => {
  const envValue = getEnv({ name: code, defaultValue }) || undefined;

  if (!models) {
    return envValue;
  }

  try {
    const stored = await models.CalcomConfigs.findOne({ code }).lean();

    // An empty string counts as unset rather than as an explicit blank: a
    // cleared field in the UI should fall back to the deployment default, not
    // disable the integration in a way nothing explains.
    if (stored?.value) {
      return stored.value;
    }
  } catch (e) {
    // A config lookup must never take down the webhook path. Falling back to
    // env keeps a running integration running through a transient DB problem.
    console.error(`calcom: could not read stored config ${code}`, e);
  }

  return envValue;
};

/** Convenience reader for the booleans, which are stored as strings. */
export const getCalcomFlag = async (
  models: IModels | undefined,
  code: CalcomConfigCode,
): Promise<boolean> => (await getCalcomConfig(models, code)) === 'true';

/**
 * Which values exist, WITHOUT returning them.
 *
 * This is what the settings UI renders. Returning the values themselves would
 * put a live API key and a webhook signing secret into a GraphQL response that
 * any user with settings access could read out of the network tab; knowing that
 * a key is present is enough to diagnose the integration.
 */
export const getCalcomConfigStatus = async (models: IModels) => {
  const entries = await Promise.all(
    CALCOM_CONFIG_CODES.map(async (code) => {
      const value = await getCalcomConfig(models, code);
      const stored = await models.CalcomConfigs.findOne({ code }).lean();

      return {
        code,
        isSet: !!value,
        // Distinguishes the two sources so an operator can tell a value they
        // set in the UI from one baked into the deployment — which is the
        // difference between "I can change this here" and "this needs a deploy".
        source: stored?.value ? 'database' : value ? 'environment' : 'unset',
      };
    }),
  );

  return entries;
};
