import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';

export const CALL_INTEGRATION_FORM_SCHEMA = z
  .object({
    name: z.string().min(1),
    phone: z
      .string()
      .regex(/^[\d\s\-()+]+$/, {
        message:
          'Phone number can include digits, spaces, dashes, parentheses, and plus signs.',
      })
      .min(1),
    websocketServer: z.string().min(1),
    brandId: z.string().min(1, 'Brand is required'),
    queues: z.string().optional(),
    srcTrunk: z.string().optional(),
    dstTrunk: z.string().optional(),
    // Optional: without it a PBX number in national format (`09876543210`) cannot
    // be resolved to E.164, so the same person calling and messaging on WhatsApp
    // becomes two contacts.
    defaultCountryCode: z
      .string()
      .regex(/^\+?\d{1,4}$/, 'Use a dialing code such as +91')
      .optional()
      .or(z.literal('')),
    operators: z.array(
      z.object({
        userId: z.string().optional(),
        gsUsername: z.string().min(1),
        gsPassword: z.string().min(1),
      }),
    ),
  })
  /**
   * Mirrors the cross-check PLIVO_INTEGRATION_SCHEMA already applies to its own
   * pair of fields. `defaultCountryCode` only prefixes numbers TYPED without
   * one — it never touches `phone`, which carries its own country — so an
   * operator setting the two to different countries (a US Grandstream number
   * with an IN default) would not see the mismatch here, only discover it once
   * some LATER inbound number was silently normalised into the wrong country
   * and split one person into two contacts.
   *
   * Unlike Plivo's digits-only field, `phone`'s regex above admits spaces,
   * dashes and parentheses, so the separators are stripped before parsing —
   * without that, `+1 (212) 555-0123` fails to parse and the check would
   * silently pass on exactly the formatting an operator is most likely to use.
   * A `phone` that still doesn't parse (a PBX extension or national-format
   * number) is left alone rather than blocked, since resolving those is the
   * very thing `defaultCountryCode` exists to do.
   */
  .refine(
    (values) => {
      if (!values.defaultCountryCode) return true;

      const digits = values.phone.replace(/[\s\-()]/g, '');

      const parsed = parsePhoneNumberFromString(
        digits.startsWith('+') ? digits : `+${digits}`,
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
