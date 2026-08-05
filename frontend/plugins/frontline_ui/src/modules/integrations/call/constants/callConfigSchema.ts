import { z } from 'zod';

// These carry a host[:port], not a full URL -- SipContainer prefixes the
// scheme itself ("turn:" / "stun:"), so a value entered with one would
// produce "turn:turn:host". Rejecting the scheme here is what makes that
// mistake visible in the form instead of at call time.
const iceHost = z
  .string()
  .trim()
  .refine((v) => !/^(stun|turn)s?:/i.test(v), {
    message: 'Enter the host only, without a "turn:" or "stun:" prefix',
  })
  .refine((v) => !/\s/.test(v), { message: 'Must not contain spaces' });

export const CALL_CONFIG_SCHEMA = z
  .object({
    // Blank is allowed: a deployment whose callers can reach each other
    // directly does not need a relay, and SipContainer omits any server left
    // empty rather than sending "turn:undefined".
    STUN_SERVER_URL: iceHost.or(z.literal('')),
    TURN_SERVER_URL: iceHost.or(z.literal('')),
    TURN_SERVER_USERNAME: z.string().trim(),
    TURN_SERVER_CREDENTIAL: z.string().trim(),
  })
  // A TURN server without credentials is not usable, and credentials without
  // a server are dead config. Either the three move together or none are set
  // -- previously any combination saved silently and only failed as missing
  // audio on a call, with nothing pointing back to this form.
  .superRefine((cfg, ctx) => {
    const turnFields = [
      'TURN_SERVER_URL',
      'TURN_SERVER_USERNAME',
      'TURN_SERVER_CREDENTIAL',
    ] as const;

    const filled = turnFields.filter((f) => cfg[f] !== '');

    if (filled.length === 0 || filled.length === turnFields.length) {
      return;
    }

    for (const field of turnFields) {
      if (cfg[field] === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: 'Required when a TURN server is configured',
        });
      }
    }
  });
