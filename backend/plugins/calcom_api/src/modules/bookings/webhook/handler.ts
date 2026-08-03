import { IModels } from '~/connectionResolvers';

import { linkBookingConformities } from './conformity';
import { emitBookingAutomation } from './emitAutomation';
import { linkAttendeesToCustomers } from './linkCustomers';
import {
  CalcomWebhookBody,
  isHandledTrigger,
  mapPayloadToBooking,
} from './mapPayload';

export type HandleResult =
  | { status: 'stored'; uid: string; created: boolean }
  | { status: 'ignored'; reason: string };

/**
 * Applies one verified webhook delivery to the mirror.
 *
 * Upsert on `uid`, not insert: Cal.com retries a delivery it did not get a 2xx
 * for, and sends several events over the life of one booking
 * (created -> rescheduled -> cancelled). Both must converge on a single row,
 * which the unique index on uid enforces.
 */
export const handleCalcomWebhook = async (
  models: IModels,
  subdomain: string,
  body: CalcomWebhookBody,
  // Set by the reconciler. A backfill is reading existing state, not observing
  // something happen, so it must not start workflows — replaying six months of
  // history would otherwise fire "booking created" for every one of them and
  // send a real email per row.
  { emitAutomations = true }: { emitAutomations?: boolean } = {},
): Promise<HandleResult> => {
  const trigger = body.triggerEvent;

  if (!isHandledTrigger(trigger)) {
    // Not an error. Cal.com sends 21 trigger types and a subscription may
    // include ones this plugin has no opinion on; answering 2xx keeps Cal.com
    // from marking the endpoint unhealthy and disabling it.
    return { status: 'ignored', reason: `unhandled_trigger:${trigger}` };
  }

  const mapped = mapPayloadToBooking(body);

  if (!mapped) {
    return { status: 'ignored', reason: 'no_uid_in_payload' };
  }

  const existing = await models.Bookings.findOne({ uid: mapped.uid });

  // Out-of-order delivery guard. Cal.com does not guarantee ordering, and
  // without this a delayed BOOKING_CREATED arriving after a BOOKING_CANCELLED
  // would resurrect the booking as accepted. Only the fields carried by the
  // newer event are compared, so a retry of the same event still applies.
  if (
    existing?.lastPayloadAt &&
    mapped.lastPayloadAt &&
    existing.lastPayloadAt > mapped.lastPayloadAt
  ) {
    return { status: 'ignored', reason: 'stale_delivery' };
  }

  const { uid, ...rest } = mapped;

  if (rest.attendees?.length) {
    // Carry forward any link already resolved for this attendee. Cal.com
    // re-sends the full attendee list on every event, so without this a
    // reschedule would overwrite erxesCustomerId with undefined and quietly
    // unlink a booking that was correctly linked when it was created.
    const previous = new Map(
      (existing?.attendees || [])
        .filter((a) => a.email && a.erxesCustomerId)
        .map((a) => [a.email as string, a.erxesCustomerId as string]),
    );

    const resolved = await linkAttendeesToCustomers(subdomain, rest.attendees);

    rest.attendees = resolved.map((a) =>
      a.erxesCustomerId || !a.email || !previous.has(a.email)
        ? a
        : { ...a, erxesCustomerId: previous.get(a.email) },
    );
  }

  await models.Bookings.updateOne(
    { uid },
    { $set: rest, $setOnInsert: { uid } },
    { upsert: true },
  );

  // After the write, deliberately: the booking is the record, the conformity
  // edge is an enrichment, and a failure in core's graph must not cost us a
  // delivery we have already verified and mapped.
  await linkBookingConformities(subdomain, uid, rest.attendees);

  // Emitted last, and only from a delivery that was actually applied — a stale
  // or duplicate webhook returns above, so a rule never fires twice for the
  // same event.
  if (emitAutomations) {
    emitBookingAutomation(subdomain, trigger, {
      ...existing?.toObject?.(),
      ...mapped,
    });
  }

  return { status: 'stored', uid, created: !existing };
};
