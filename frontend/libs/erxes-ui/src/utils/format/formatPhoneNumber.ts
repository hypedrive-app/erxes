import { AsYouType, CountryCode } from 'libphonenumber-js';
import { DEFAULT_PHONE_COUNTRY } from './defaultPhoneCountry';

/**
 * Formats a phone number for display.
 *
 * `defaultCountry` is only consulted for numbers that do NOT carry their own
 * `+<country>` prefix; an already-international number formats the same
 * whatever is passed. Omitting it falls back to the deployment-wide default, so
 * a national-format number is grouped according to where this deployment
 * actually dials from rather than a country baked into the bundle.
 *
 * Pass `defaultCountry` explicitly only when a more specific country is known
 * for that number — for example an integration's own `defaultCountryCode`.
 */
export const formatPhoneNumber = ({
  defaultCountry = DEFAULT_PHONE_COUNTRY,
  value,
}: {
  defaultCountry?: CountryCode;
  value: string;
}): string => {
  return new AsYouType({ defaultCountry }).input(value);
};
