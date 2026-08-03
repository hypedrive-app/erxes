import { IModels } from '~/connectionResolvers';

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

  return { status: 'stored', uid, created: !existing };
};
