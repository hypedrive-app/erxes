import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';

/**
 * Only `authId`, `authToken` and `plivoPhoneNumber` are enforced by the backend
 * — it verifies them against Plivo before storing the integration. `appId` and
 * the call options stay optional so a number can be connected before the Plivo
 * application is created.
 */
export const PLIVO_INTEGRATION_SCHEMA = z
  .object({
    name: z.string().min(1, 'Name is required'),
    brandId: z.string().min(1, 'Brand is required'),
    authId: z.string().min(1, 'Auth ID is required'),
    authToken: z.string().min(1, 'Auth token is required'),
    // Same pattern PLIVO_CONFIG_SCHEMA already enforces on forwardToNumber —
    // this field only ever had a non-empty check, so a locally-formatted or
    // malformed number reached the backend and came back as an opaque error
    // instead of being caught here with guidance.
    plivoPhoneNumber: z
      .string()
      .trim()
      .regex(
        /^\+?\d{6,15}$/,
        'Use a phone number in international format, such as +919000000000',
      ),
    appId: z.string().optional(),
    defaultCountryCode: z
      .string()
      .regex(/^\+?\d{1,4}$/, 'Use a dialing code such as +91')
      .optional()
      .or(z.literal('')),
    recordCalls: z.boolean(),
  })
  /**
   * `defaultCountryCode` only prefixes numbers TYPED without one — it never
   * touches `plivoPhoneNumber`, which is already stored with its own `+` — so
   * an operator setting the two to different countries (a US number with an
   * IN default) would not see the mismatch here, only discover it once the
   * dialpad silently normalised some LATER outbound call to the wrong
   * country. Both are digits-only by the time this runs (the leading `+` is
   * optional in each field's own regex above), so the check is a plain
   * prefix comparison rather than a full parse — a genuine mismatch is
   * still caught even though this is not `plivoPhoneNumber`'s own dialling
   * code.
   */
  .refine(
    (values) => {
      if (!values.defaultCountryCode) return true;

      const parsed = parsePhoneNumberFromString(
        values.plivoPhoneNumber.startsWith('+')
          ? values.plivoPhoneNumber
          : `+${values.plivoPhoneNumber}`,
      );

      if (!parsed?.countryCallingCode) return true;

      const configuredCode = values.defaultCountryCode.replace(/^\+/, '');

      return configuredCode === parsed.countryCallingCode;
    },
    {
      path: ['defaultCountryCode'],
      message:
        "This doesn't match the connected number's own country — numbers typed without a country will be dialled in the wrong one.",
    },
  );

export const PLIVO_EDIT_SCHEMA = z.object({
  name: z.string().min(1, 'Name is required'),
  brandId: z.string().min(1, 'Brand is required'),
});
