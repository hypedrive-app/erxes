import { z } from 'zod';

/**
 * Only `phoneNumberId` and `accessToken` are enforced by the backend; the rest
 * refine webhook verification and phone normalisation and stay optional so a
 * number can be connected before the Meta app webhook is configured.
 */
export const WHATSAPP_INTEGRATION_SCHEMA = z.object({
  name: z.string().min(1, 'Name is required'),
  brandId: z.string().min(1, 'Brand is required'),
  phoneNumberId: z.string().min(1, 'Phone number ID is required'),
  accessToken: z.string().min(1, 'Access token is required'),
  whatsappBusinessAccountId: z.string().optional(),
  appSecret: z.string().optional(),
  verifyToken: z.string().optional(),
  defaultCountryCode: z
    .string()
    .regex(/^\+?\d{1,4}$/, 'Use a dialing code such as +91')
    .optional()
    .or(z.literal('')),
});

export const WHATSAPP_EDIT_SCHEMA = z.object({
  name: z.string().min(1, 'Name is required'),
  brandId: z.string().min(1, 'Brand is required'),
});

export const WHATSAPP_MESSAGE_WINDOW_HOURS = 24;
