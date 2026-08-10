import { getEnv } from 'erxes-api-shared/utils';

import { IModels } from '~/connectionResolvers';

/**
 * Config resolution for the enrichment providers.
 *
 * DB-first with an env fallback, which is erxes' convention — frontline's
 * getConfig (modules/integrations/instagram/commonUtils.ts) and calcom's
 * getCalcomConfig both resolve `configs[CODE] ?? env[CODE]`.
 *
 * DB wins over env deliberately: env is the deployment's default, while a value
 * set in the UI is a later and more specific decision by an operator. It also
 * means rotating a leaked provider key is a form submission rather than a
 * redeploy of the whole stack.
 */

export const ENRICHMENT_CONFIG_CODES = [
  'SURFE_API_KEY',
  'APOLLO_API_KEY',
  'HUNTER_API_KEY',
  // Surepass is already deployed for KYC on this fleet under this exact name,
  // so an env fallback finds the existing token without a second copy of it.
  'SUREPASS_API_TOKEN',
] as const;

export type EnrichmentConfigCode = (typeof ENRICHMENT_CONFIG_CODES)[number];

// Which key each provider reads. Kept as a map rather than derived by string
// concatenation so a renamed provider key fails to compile instead of silently
// reading an undefined config.
export const PROVIDER_CONFIG_CODE: Record<string, EnrichmentConfigCode> = {
  surfe: 'SURFE_API_KEY',
  apollo: 'APOLLO_API_KEY',
  hunter: 'HUNTER_API_KEY',
  surepass: 'SUREPASS_API_TOKEN',
};

/**
 * Reads one config value, preferring the stored value over the environment.
 */
export const getEnrichmentConfig = async (
  models: IModels | undefined,
  code: EnrichmentConfigCode,
): Promise<string> => {
  if (models) {
    const stored = await models.EnrichmentConfigs.findOne({ code }).lean();

    if (stored?.value) {
      return stored.value;
    }
  }

  return getEnv({ name: code, defaultValue: '' });
};

/**
 * Which providers are usable right now, for the settings screen and for the
 * UI's per-provider button state. Values are never returned — only whether one
 * is present and where it came from.
 */
export const getEnrichmentConfigStatus = async (models: IModels) =>
  Promise.all(
    ENRICHMENT_CONFIG_CODES.map(async (code) => {
      const stored = await models.EnrichmentConfigs.findOne({ code }).lean();

      if (stored?.value) {
        return { code, isSet: true, source: 'database' };
      }

      return getEnv({ name: code, defaultValue: '' })
        ? { code, isSet: true, source: 'environment' }
        : { code, isSet: false, source: 'unset' };
    }),
  );
