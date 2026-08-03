import { initTRPC } from '@trpc/server';
import { ITRPCContext } from 'erxes-api-shared/utils';
import { z } from 'zod';

import { IModels } from '~/connectionResolvers';

export type BookingsTRPCContext = ITRPCContext<{ models: IModels }>;

const t = initTRPC.context<BookingsTRPCContext>().create();

/**
 * How other plugins read the booking mirror.
 *
 * GraphQL is for the browser; tRPC is how erxes services talk to each other,
 * and without it this plugin's data is invisible to everything but its own UI.
 * The concrete need is the reverse of the link this plugin already makes: it
 * resolves attendees to customers, so core/frontline/sales all have contacts
 * that a booking points AT, with no way to ask "what has this person booked".
 *
 * Read-only on purpose. Cal.com owns bookings and the webhook receiver is the
 * mirror's single writer; exposing a mutation here would create a second writer
 * reachable by any plugin, which is exactly what the write-through GraphQL
 * mutations were designed to avoid.
 */
export const bookingsTrpcRouter = t.router({
  calcom: t.router({
    /**
     * Bookings for one contact, newest first.
     *
     * Bounded by a limit with a hard ceiling: a contact with years of history
     * would otherwise return an unbounded array over the wire to a caller that
     * almost always wants the last few.
     */
    findByCustomer: t.procedure
      .input(
        z.object({
          customerId: z.string(),
          status: z.string().optional(),
          limit: z.number().int().positive().max(100).optional(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const { models } = ctx;
        const { customerId, status, limit } = input;

        return models.Bookings.find({
          'attendees.erxesCustomerId': customerId,
          ...(status ? { status } : {}),
        })
          .sort({ startTime: -1 })
          .limit(limit ?? 20)
          .lean();
      }),

    /**
     * One booking by Cal.com uid.
     *
     * uid rather than _id because that is the identifier that travels: it is on
     * every webhook, in every Cal.com URL, and is what an automation or a
     * support conversation would be holding.
     */
    findByUid: t.procedure
      .input(z.object({ uid: z.string() }))
      .query(async ({ ctx, input }) => {
        const { models } = ctx;

        return models.Bookings.findOne({ uid: input.uid }).lean();
      }),

    /**
     * Whether a contact has an upcoming booking, and when.
     *
     * Exists as its own procedure rather than leaving callers to filter
     * findByCustomer: "does this person already have a meeting booked" is the
     * question an automation actually asks — before sending a follow-up, or to
     * branch a workflow — and doing it here keeps that logic in one place
     * instead of re-implemented per caller.
     */
    hasUpcoming: t.procedure
      .input(z.object({ customerId: z.string() }))
      .query(async ({ ctx, input }) => {
        const { models } = ctx;

        const next = await models.Bookings.findOne({
          'attendees.erxesCustomerId': input.customerId,
          startTime: { $gte: new Date() },
          // Cancelled and rejected bookings are still mirrored — the record of
          // the cancellation matters — but they are not upcoming meetings.
          status: { $nin: ['CANCELLED', 'REJECTED'] },
        })
          .sort({ startTime: 1 })
          .lean();

        return { hasUpcoming: !!next, booking: next ?? null };
      }),
  }),
});
