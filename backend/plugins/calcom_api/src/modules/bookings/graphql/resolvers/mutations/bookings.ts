import { IContext } from '~/connectionResolvers';

import {
  cancelCalcomBooking,
  confirmCalcomBooking,
  createCalcomBooking,
  declineCalcomBooking,
  markCalcomNoShow,
  rescheduleCalcomBooking,
} from '@/bookings/calcomApi';
import {
  CALCOM_CONFIG_CODES,
  CalcomConfigCode,
  getCalcomConfigStatus,
} from '@/bookings/config';

/**
 * Write-through mutations.
 *
 * Every one of these asks Cal.com to make a change and returns as soon as
 * Cal.com accepts it. None of them writes to the Bookings collection.
 *
 * That is the design, not an omission: Cal.com owns bookings and emits a
 * webhook for every change it applies. The webhook receiver is already the
 * single writer of the mirror, and it handles ordering, retries and the
 * customer link. A mutation that also wrote a row would be a second, subtly
 * different writer racing the first — the usual way a mirror ends up
 * disagreeing with its source. The cost is that the UI sees the change one
 * webhook round trip later, which is the right trade.
 */

type AttendeeAbsence = { email: string; absent: boolean };

const requireUid = (uid?: string) => {
  // Guarded rather than passed through: an empty uid builds the URL
  // `/bookings//cancel`, which Cal.com answers 404 for — a confusing way to
  // report a bad argument.
  if (!uid) {
    throw new Error('uid is required');
  }

  return uid;
};

export const bookingsMutations = {
  calcomCancelBooking: async (
    _parent: undefined,
    { uid, cancellationReason }: { uid: string; cancellationReason?: string },
    { models }: IContext,
  ) => {
    await cancelCalcomBooking(models, requireUid(uid), cancellationReason);

    return { ok: true, uid };
  },

  calcomRescheduleBooking: async (
    _parent: undefined,
    {
      uid,
      start,
      reschedulingReason,
    }: { uid: string; start: string; reschedulingReason?: string },
    { models }: IContext,
  ) => {
    const result = await rescheduleCalcomBooking(
      models,
      requireUid(uid),
      start,
      reschedulingReason,
    );

    // A reschedule produces a NEW booking with a new uid and cancels the
    // original, so the caller is handed the new one — returning the old uid
    // would point at a row that is now CANCELLED.
    return { ok: true, uid: result?.data?.uid || result?.uid || uid };
  },

  calcomMarkNoShow: async (
    _parent: undefined,
    {
      uid,
      noShowHost,
      attendees,
    }: { uid: string; noShowHost?: boolean; attendees?: AttendeeAbsence[] },
    { models }: IContext,
  ) => {
    // Only the parts the caller actually supplied are forwarded. Sending
    // `noShowHost: undefined` as an explicit key would ask Cal.com to clear a
    // flag the caller never mentioned.
    await markCalcomNoShow(models, requireUid(uid), {
      ...(typeof noShowHost === 'boolean' ? { noShowHost } : {}),
      ...(attendees?.length ? { attendees } : {}),
    });

    return { ok: true, uid };
  },

  calcomCreateBooking: async (
    _parent: undefined,
    {
      eventTypeId,
      start,
      attendee,
      customerId,
    }: {
      eventTypeId: number;
      start: string;
      attendee: { name: string; email: string; timeZone?: string };
      customerId?: string;
    },
    { models }: IContext,
  ) => {
    const result = await createCalcomBooking(models, {
      eventTypeId,
      start,
      attendee: {
        name: attendee.name,
        email: attendee.email,
        // Cal.com requires a timeZone and rejects the booking without one.
        // UTC is the honest default when the caller did not say: it is a real
        // zone, and `start` is absolute regardless.
        timeZone: attendee.timeZone || 'UTC',
      },
      // Carried through Cal.com and echoed back on the webhook. This is what
      // lets a booking made from a contact panel attach to THAT contact even
      // when the attendee email is one the CRM has never seen — otherwise the
      // link would depend on an email match that may not exist yet.
      ...(customerId ? { metadata: { erxesCustomerId: customerId } } : {}),
    });

    return { ok: true, uid: result?.data?.uid || result?.uid };
  },

  calcomConfirmBooking: async (
    _parent: undefined,
    { uid }: { uid: string },
    { models }: IContext,
  ) => {
    await confirmCalcomBooking(models, requireUid(uid));

    return { ok: true, uid };
  },

  calcomDeclineBooking: async (
    _parent: undefined,
    { uid, reason }: { uid: string; reason?: string },
    { models }: IContext,
  ) => {
    await declineCalcomBooking(models, requireUid(uid), reason);

    return { ok: true, uid };
  },

  /**
   * Stores one integration setting.
   *
   * The code is checked against the known list rather than written straight
   * through: this collection is read by the webhook verifier and the API
   * client, and an arbitrary key/value pair from a caller has no business
   * landing in it.
   */
  calcomSetConfig: async (
    _parent: undefined,
    { code, value }: { code: string; value?: string },
    { models }: IContext,
  ) => {
    if (!(CALCOM_CONFIG_CODES as readonly string[]).includes(code)) {
      throw new Error(`Unknown Cal.com setting: ${code}`);
    }

    // Trimmed because these are pasted credentials, and a trailing newline
    // from a copy-paste would silently break every signature check.
    await models.CalcomConfigs.setConfig(
      code as CalcomConfigCode,
      value?.trim() || undefined,
    );

    // Reported through the shared status helper rather than inferred here.
    // Clearing a stored value falls back to env, which may itself be unset —
    // answering 'environment' unconditionally would claim a setting exists
    // when nothing is configured at all.
    const status = await getCalcomConfigStatus(models);

    return status.find((entry) => entry.code === code);
  },
};
