import {
  CountryCode,
  getCountries,
  getCountryCallingCode,
} from 'libphonenumber-js';
import { REACT_APP_DEFAULT_PHONE_DIALING_CODE } from 'erxes-ui/utils/config';

/**
 * Country assumed when the deployment has configured no dialing code.
 *
 * Deliberately NOT a country. `libphonenumber-js` reads an `undefined`
 * `defaultCountry` as "this number must carry its own country code", which is
 * the only honest answer when nothing has told us where the deployment dials
 * from. Any concrete country here would re-create the bug this constant
 * replaces: upstream hardcoded `'MN'`, so on a non-Mongolian deployment every
 * number typed without a `+<country>` was parsed against Mongolia's numbering
 * plan and formatted — confidently, and wrongly — as a Mongolian number.
 * Substituting `'IN'` would fix this tenant and break the next one identically.
 *
 * The visible consequence of `undefined` is that a national-format number stays
 * unformatted until an admin sets `REACT_APP_DEFAULT_PHONE_DIALING_CODE`. That
 * is a prompt to configure the deployment, which is recoverable; a number
 * silently attributed to the wrong country is not.
 */
export const FALLBACK_PHONE_COUNTRY: CountryCode | undefined = undefined;

/**
 * ISO country per dialing code, derived from the library's own metadata.
 *
 * Configuration stores a DIALING CODE as digits (`'91'`), matching the shape
 * the backend's `normalizePhone` concatenates and the shape already stored on
 * integrations as `defaultCountryCode`. `libphonenumber-js` instead wants an
 * ISO-3166 alpha-2 `CountryCode` (`'IN'`), so the two must be bridged. Building
 * the map from `getCountries()`/`getCountryCallingCode()` keeps it in step with
 * whatever metadata the installed version ships, rather than freezing a
 * hand-written country table that goes stale silently.
 *
 * Twelve dialing codes are shared by more than one country in the installed
 * metadata — `+1` by the 25 NANP members, `+7` by RU and KZ, `+44` by GB and
 * the Crown Dependencies — so the mapping is genuinely many-to-one and cannot
 * be inverted exactly. It does not need to be. Countries sharing a dialing code
 * share a numbering plan, so every candidate parses the same national number to
 * the same E.164 string: `2015550123` is `+12015550123` under US, CA and AG
 * alike. What is resolved here is therefore a NUMBERING PLAN, not a
 * jurisdiction, and nothing downstream reads the country for anything else.
 *
 * The tie is broken deterministically by keeping the FIRST candidate
 * `getCountries()` yields — a stable alphabetical order — so a given dialing
 * code always resolves to the same country across reloads. Later duplicates are
 * dropped rather than overwriting, which is what makes "first wins" true.
 */
const COUNTRY_BY_DIALING_CODE: ReadonlyMap<string, CountryCode> =
  getCountries().reduce((map, country) => {
    const dialingCode = getCountryCallingCode(country);

    return map.has(dialingCode) ? map : map.set(dialingCode, country);
  }, new Map<string, CountryCode>());

/**
 * Turns a stored dialing code into a country the phone parser accepts.
 *
 * Accepts the value in every shape configuration and the database allow:
 * `'91'`, `'+91'`, `' 91 '`, and the empty string a cleared form field writes.
 * Anything that is not a dialing code the metadata knows resolves to the
 * fallback rather than throwing — a mistyped setting must degrade to "country
 * unknown", not break every phone input in the product.
 *
 * The parameter is typed `unknown` because the runtime value is not typed at
 * all: the container entrypoint serialises `window.env` as JSON, so an
 * all-digit setting like `91` arrives as a NUMBER. Calling `.replace` on it
 * threw at module-eval time, and because this module is imported during the
 * app's first render that took down the whole SPA with a blank page rather
 * than degrading one phone field. Coercing here keeps the failure impossible
 * regardless of what shape the deployment writes.
 */
export const resolvePhoneCountry = (
  dialingCode?: unknown,
): CountryCode | undefined => {
  const digits = String(dialingCode ?? '').replace(/\D/g, '');

  if (!digits) return FALLBACK_PHONE_COUNTRY;

  return COUNTRY_BY_DIALING_CODE.get(digits) ?? FALLBACK_PHONE_COUNTRY;
};

/**
 * The deployment-wide default country for phone inputs.
 *
 * Resolved once at module load: the underlying `window.env` value is written by
 * the container entrypoint before the bundle runs and cannot change afterwards,
 * so re-deriving it per render would only repeat the same lookup.
 *
 * Call sites that have a more specific country available (an integration's own
 * `defaultCountryCode`, or a country parsed off the number itself) should
 * prefer it and fall back to this.
 */
export const DEFAULT_PHONE_COUNTRY: CountryCode | undefined =
  resolvePhoneCountry(REACT_APP_DEFAULT_PHONE_DIALING_CODE);
