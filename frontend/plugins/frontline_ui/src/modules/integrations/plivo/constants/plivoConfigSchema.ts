import { z } from 'zod';

/**
 * Seconds fields arrive from a text input, so they are coerced rather than
 * declared as numbers — an empty box is `''`, which `z.number()` would reject
 * with "expected number, received string" instead of the bound message.
 *
 * Coercion turns both `''` and non-numeric text into `0`, so the lower bound is
 * what reports them; there is no reachable "not a number" case to message.
 *
 * The bounds are the ones live routing actually depends on: a stage shorter
 * than 5s never completes a ring, and two stages that together outlast the
 * caller's patience are what strand a call in ringback with no voicemail.
 */
const ringSeconds = (label: string) =>
  z.coerce
    .number()
    .int(`${label} must be a whole number of seconds`)
    .min(5, `${label} must be at least 5 seconds`)
    .max(120, `${label} cannot exceed 120 seconds`);

/**
 * The settings the config screen owns for one connected number.
 *
 * Credentials are deliberately NOT here. The auth token is write-only and is
 * never read back from the server, so this form edits routing only — changing
 * credentials means reconnecting the number.
 */
export const PLIVO_CONFIG_SCHEMA = z
  .object({
    _id: z.string().min(1),
    ringAgents: z.boolean(),
    agentRingTimeout: ringSeconds('Agent ring time'),
    forwardToNumber: z
      .string()
      .trim()
      .regex(
        /^\+?\d{6,15}$/,
        'Use a phone number in international format, such as +919000000000',
      )
      .optional()
      .or(z.literal('')),
    forwardTimeout: ringSeconds('Fallback ring time'),
    voicemailEnabled: z.boolean(),
    voicemailMaxLength: z.coerce
      .number()
      .int('Voicemail length must be a whole number of seconds')
      .min(10, 'Voicemail length must be at least 10 seconds')
      .max(3600, 'Voicemail length cannot exceed 3600 seconds'),
    voicemailGreeting: z
      .string()
      .trim()
      .max(1000, 'Greeting cannot exceed 1000 characters'),
    recordCalls: z.boolean(),
  })
  /**
   * A number that rings nobody is the failure this form exists to prevent: with
   * agent ringing off and no fallback number, an inbound call reaches the
   * announce-only branch and the caller is dropped unless voicemail catches it.
   */
  .refine(
    (values) =>
      values.ringAgents || !!values.forwardToNumber || values.voicemailEnabled,
    {
      path: ['forwardToNumber'],
      message:
        'With agent ringing and voicemail both off, a fallback number is required — otherwise inbound calls reach nobody.',
    },
  );

export type PlivoConfigValues = z.infer<typeof PLIVO_CONFIG_SCHEMA>;
