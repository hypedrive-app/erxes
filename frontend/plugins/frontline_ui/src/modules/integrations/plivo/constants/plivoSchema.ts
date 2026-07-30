import { z } from 'zod';

/**
 * Only `authId`, `authToken` and `plivoPhoneNumber` are enforced by the backend
 * — it verifies them against Plivo before storing the integration. `appId` and
 * the call options stay optional so a number can be connected before the Plivo
 * application is created.
 */
export const PLIVO_INTEGRATION_SCHEMA = z.object({
  name: z.string().min(1, 'Name is required'),
  brandId: z.string().min(1, 'Brand is required'),
  authId: z.string().min(1, 'Auth ID is required'),
  authToken: z.string().min(1, 'Auth token is required'),
  plivoPhoneNumber: z.string().min(1, 'Plivo phone number is required'),
  appId: z.string().optional(),
  defaultCountryCode: z
    .string()
    .regex(/^\+?\d{1,4}$/, 'Use a dialing code such as +91')
    .optional()
    .or(z.literal('')),
  recordCalls: z.boolean(),
});

export const PLIVO_EDIT_SCHEMA = z.object({
  name: z.string().min(1, 'Name is required'),
  brandId: z.string().min(1, 'Brand is required'),
});
