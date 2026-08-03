import { IModels } from '~/connectionResolvers';

import { listCalcomBookings } from './calcomApi';
import { handleCalcomWebhook } from './webhook/handler';

/**
 * Backfills bookings the webhook never delivered.
 *
 * Webhooks are lossy in ways nothing else notices: the endpoint can be down
 * during a deploy, Cal.com disables a subscriber that fails repeatedly, and a
 * subscription can simply be created after bookings already exist. None of
 * those surface as an error — the mirror is just quietly short, and the only
 * way to find out is to ask Cal.com what it has.
 *
 * Deliveries are replayed through handleCalcomWebhook rather than written
 * directly, so backfilled rows go through the same mapping, customer linking
 * and conformity path as live ones. The upsert-on-uid makes replaying a
 * booking that IS already mirrored a no-op rather than a duplicate.
 */
export const reconcileBookings = async (
  models: IModels,
  subdomain: string,
  { afterStart, beforeEnd }: { afterStart?: string; beforeEnd?: string } = {},
): Promise<{ seen: number; stored: number; ignored: number }> => {
  let skip = 0;
  const take = 100;

  let seen = 0;
  let stored = 0;
  let ignored = 0;

  // Paged rather than fetched whole: an instance with a long history would
  // otherwise pull every booking into memory at once.
  for (;;) {
    const page = await listCalcomBookings(models, {
      afterStart,
      beforeEnd,
      take,
      skip,
    });

    // Cal.com v2 wraps list results in { data: [...] }; older shapes return the
    // array directly, so both are accepted rather than assuming one.
    const bookings: any[] = Array.isArray(page) ? page : page?.data || [];

    if (!bookings.length) break;

    for (const booking of bookings) {
      seen++;

      // Synthesised envelope. The reconciler is reading state, not receiving an
      // event, so the trigger is reported as BOOKING_CREATED — the handler's
      // staleness guard then keeps it from overwriting a row that a real, later
      // webhook has already advanced past.
      const result = await handleCalcomWebhook(
        models,
        subdomain,
        {
          triggerEvent: 'BOOKING_CREATED',
          createdAt: booking.createdAt || booking.startTime,
          payload: booking,
        },
        // Automations stay off: this is a read of existing state, and firing
        // "booking created" across a backfill would send a real email per row.
        { emitAutomations: false },
      );

      if (result.status === 'stored') stored++;
      else ignored++;
    }

    if (bookings.length < take) break;
    skip += take;
  }

  return { seen, stored, ignored };
};
