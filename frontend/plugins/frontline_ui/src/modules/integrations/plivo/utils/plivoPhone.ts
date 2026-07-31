import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Country assumed for numbers stored without a `+` prefix.
 *
 * Matches the `defaultCountry` the Grandstream dialpad and every existing
 * `formatPhoneNumber` call in this plugin already pass, so a number that
 * displays one way in the contact list dials the same way here.
 */
export const PLIVO_DEFAULT_COUNTRY: CountryCode = 'MN';

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
  defaultCountry: CountryCode = PLIVO_DEFAULT_COUNTRY,
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
  defaultCountry: CountryCode = PLIVO_DEFAULT_COUNTRY,
): boolean => toDialableNumber(value, defaultCountry) !== null;
