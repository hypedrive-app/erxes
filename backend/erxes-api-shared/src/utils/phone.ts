/**
 * Phone number normalisation shared by every channel that identifies a contact
 * by phone number (call/SIP, WhatsApp, SMS, ...).
 *
 * Why this exists: contact de-duplication goes through
 * `receiveInboxMessage('get-create-update-customer', { primaryPhone })`, which
 * matches on an EXACT string. Providers disagree about formatting for the same
 * human — WhatsApp Cloud API sends bare E.164 digits (`919876543210`), a PBX may
 * send national format (`09876543210`), and users type `+91 98765-43210`. Without
 * a single canonical form each spelling creates a separate customer record.
 *
 * There is no unique index on `primaryPhone`, so nothing downstream will catch a
 * mismatch for us.
 */

/** Digits only, with an optional leading `+`. */
const NON_DIAL_CHARS = /[^\d+]/g;

/**
 * Normalises a phone number to E.164 (`+` followed by digits).
 *
 * Deliberately dependency-free and conservative: it fixes the formatting
 * differences we actually see between providers (spaces, dashes, parentheses,
 * `00` international prefix, a national trunk `0`) and otherwise leaves the
 * number alone. It does NOT validate against per-country numbering plans — a
 * wrong-but-consistent value still de-duplicates correctly, whereas guessing
 * could merge two different people.
 *
 * @param raw - the number as the provider supplied it
 * @param defaultCountryCode - digits only, no `+` (e.g. `'91'`). Used only when
 *   the number carries no country code of its own; without it a national-format
 *   number is returned digits-only rather than being assigned a wrong country.
 * @returns the normalised number, or an empty string when there is nothing usable
 *
 * @example
 * normalizePhone('+91 98765-43210')       // '+919876543210'
 * normalizePhone('0091 9876543210')       // '+919876543210'
 * normalizePhone('09876543210', '91')     // '+919876543210'
 * normalizePhone('9876543210')            // '9876543210'  (no country code known)
 */
export const normalizePhone = (
  raw?: string | null,
  defaultCountryCode?: string,
): string => {
  if (!raw) {
    return '';
  }

  // Keep a leading `+` but drop every other separator: spaces, dashes,
  // parentheses, dots, and any stray `+` that is not the first character.
  const cleaned = raw.trim().replace(NON_DIAL_CHARS, '');
  const hasPlus = cleaned.startsWith('+');
  let digits = cleaned.replace(/\+/g, '');

  // Nothing but zeroes (or nothing at all) identifies no one. Bail out before
  // any prefix handling, otherwise `'0'`/`'000'` would be turned into a bogus
  // `+<country>` that every such input would share.
  if (!digits || !/[1-9]/.test(digits)) {
    return '';
  }

  if (hasPlus) {
    return `+${digits}`;
  }

  // `00` is the international access prefix in much of the world — the digits
  // after it are already a country code.
  if (digits.startsWith('00')) {
    return `+${digits.slice(2)}`;
  }

  const country = (defaultCountryCode || '').replace(/\D/g, '');

  if (country) {
    // A single leading `0` is a national trunk prefix and is dropped when the
    // number is written internationally.
    if (digits.startsWith('0')) {
      digits = digits.replace(/^0+/, '');
    } else if (digits.startsWith(country)) {
      // Already carries its country code, just without the `+`.
      return `+${digits}`;
    }

    return `+${country}${digits}`;
  }

  // No country code available and none present in the number: return the bare
  // digits. Consistent, which is what de-duplication needs, even though it is
  // not strictly E.164.
  return digits;
};

/**
 * True when two phone numbers refer to the same subscriber once normalised.
 *
 * @param a - first number, in any format
 * @param b - second number, in any format
 * @param defaultCountryCode - see {@link normalizePhone}
 */
export const isSamePhone = (
  a?: string | null,
  b?: string | null,
  defaultCountryCode?: string,
): boolean => {
  const left = normalizePhone(a, defaultCountryCode);
  const right = normalizePhone(b, defaultCountryCode);

  return Boolean(left) && left === right;
};
