import { z } from 'zod';

/**
 * Config for the `calcom:bookings.cancel` action.
 *
 * Both fields are optional, and deliberately so — the handler
 * (backend meta/automations/automationHandlers.ts) resolves the booking as
 * `action?.config?.uid || execution?.target?.uid`, so a workflow triggered by
 * a booking event already knows which booking to cancel and needs no config at
 * all. Requiring a uid here would break the common case ("when a booking is
 * created, cancel it") in favour of the rare one.
 */
export const calcomCancelActionConfigFormSchema = z.object({
  uid: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

export type TCalcomCancelActionConfigForm = z.infer<
  typeof calcomCancelActionConfigFormSchema
>;

export type TCalcomActionConfigForm = TCalcomCancelActionConfigForm;
