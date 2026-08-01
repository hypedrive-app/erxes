import { DEFAULT_PHONE_COUNTRY, resolvePhoneCountry } from 'erxes-ui';
import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Country the dialpad falls back to when the integration names none.
 *
 * The deployment-wide default rather than a constant baked in here: upstream
 * hardcoded `'MN'` in this plugin, so on a non-Mongolian deployment every
 * number typed without `+<country>` was parsed against Mongolia's numbering
 * plan and rejected as invalid. Where a tenant dials from is a property of the
 * tenant, so it is configured once for the deployment and read from there.
 *
 * `undefined` when the deployment has not configured one either, which makes
 * the parser require a full international number instead of attributing a
 * national one to an arbitrary country.
 */
export const PLIVO_FALLBACK_COUNTRY: CountryCode | undefined =
  DEFAULT_PHONE_COUNTRY;

/**
 * Turns an integration's stored dialing code into a country the parser accepts.
 *
 * The integration stores a DIALING CODE as digits (`'91'`) — the shape the
 * backend's `normalizePhone` concatenates — while `libphonenumber-js` wants an
 * ISO-3166 country (`'IN'`). `resolvePhoneCountry` (erxes-ui) does that
 * conversion from the library's own metadata and is shared with every other
 * phone surface, so the dialpad and the contact list cannot drift apart on how
 * a code maps to a country.
 *
 * An integration with no dialing code of its own inherits the deployment
 * default rather than resolving to nothing, so the common single-country
 * deployment works without configuring the same value twice.
 */
export const resolvePlivoCountry = (
  defaultCountryCode?: string | null,
): CountryCode | undefined =>
  resolvePhoneCountry(defaultCountryCode) ?? PLIVO_FALLBACK_COUNTRY;

/**
 * Strips a typed or pasted value down to what a dial string may contain.
 *
 * The dialpad's atom is the single source of truth for what will be dialled, so
 * everything that reaches it goes through here: grouping spaces and
 * non-breaking spaces from a formatted paste, the `(`/`)`/`-`/`.` a number is
 * written with on a business card, and a `tel:` URI when the value came from a
 * link or a mobile contact card.
 *
 * A `+` is meaningful only as the first character — it is what tells the parser
 * the number already carries its country code — so exactly one is kept, at the
 * front, and any other is dropped. `*` and `#` survive because they are keys on
 * the pad and are dialable on the trunk.
 */
export const sanitizeDialInput = (value: string): string => {
  const withoutScheme = value.replace(/^\s*tel:/i, '');
  const hasLeadingPlus = /^\s*\+/.test(withoutScheme);
  const body = withoutScheme.replace(/[^\d*#]/g, '');

  return hasLeadingPlus ? `+${body}` : body;
};

/**
 * Converts a stored or typed number into the E.164 form Plivo dials.
 *
 * `formatPhoneNumber` (erxes-ui) is deliberately not reused for this: it wraps
 * `AsYouType().input()`, which produces a grouped *display* string such as
 * `9911 2233` — spaces and no country code. Handing that to `startCall` would
 * dial a number the carrier rejects, so dialling parses to E.164 separately and
 * `formatPhoneNumber` stays responsible only for what is shown.
 *
 * Returns `null` when the number cannot be parsed or is not a valid number for
 * its region, so a malformed value fails visibly at the button rather than
 * silently becoming a dropped call.
 */
export const toDialableNumber = (
  value?: string | null,
  defaultCountry: CountryCode | undefined = PLIVO_FALLBACK_COUNTRY,
): string | null => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Short internal extensions are dialable on the SIP trunk but are never valid
  // E.164, so they bypass the parser instead of being rejected by it.
  if (/^\d{2,5}$/.test(trimmed)) return trimmed;

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);

  if (!parsed?.isValid()) return null;

  return parsed.number;
};

/** True when `value` can be dialled as-is. */
export const isDialableNumber = (
  value?: string | null,
  defaultCountry: CountryCode | undefined = PLIVO_FALLBACK_COUNTRY,
): boolean => toDialableNumber(value, defaultCountry) !== null;
