import { z } from 'zod';

export const CALL_INTEGRATION_FORM_SCHEMA = z.object({
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
});
