import { IContext } from '~/connectionResolvers';

import { getCalcomSlots, listCalcomEventTypes } from '@/bookings/calcomApi';
import { getCalcomConfigStatus } from '@/bookings/config';

type ListArgs = {
  customerId?: string;
  status?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  perPage?: number;
};

export const bookingsQueries = {
  calcomBooking: async (
    _parent: undefined,
    { _id, uid }: { _id?: string; uid?: string },
    { models }: IContext,
  ) => {
    if (_id) return models.Bookings.findOne({ _id });
    if (uid) return models.Bookings.findOne({ uid });
    return null;
  },

  calcomBookings: async (
    _parent: undefined,
    { customerId, status, startDate, endDate, page, perPage }: ListArgs,
    { models }: IContext,
  ) => {
    const selector: Record<string, any> = {};

    if (customerId) {
      selector['attendees.erxesCustomerId'] = customerId;
    }

    if (status) {
      selector.status = status;
    }

    // Range filters are applied only for the bounds actually supplied, so
    // passing just one end does not silently constrain the other.
    if (startDate || endDate) {
      selector.startTime = {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      };
    }

    const limit = Math.min(Math.max(perPage ?? 20, 1), 100);
    const skip = Math.max((page ?? 1) - 1, 0) * limit;

    // countDocuments runs against the same selector rather than the page, so
    // totalCount describes the filtered set and not the returned slice.
    const [list, totalCount] = await Promise.all([
      models.Bookings.find(selector).sort({ startTime: -1 }).skip(skip).limit(limit),
      models.Bookings.countDocuments(selector),
    ]);

    return { list, totalCount };
  },

  /**
   * Bookable event types, read live from Cal.com.
   *
   * Not mirrored and not cached: an event type is configuration, no webhook
   * announces a change to one, and a stale copy would offer people a duration
   * or an event that no longer exists.
   */
  calcomEventTypes: async (
    _parent: undefined,
    { username }: { username?: string },
    { models }: IContext,
  ) => {
    const result = await listCalcomEventTypes(models, username);

    // v2 wraps list results in { data: [...] }; some deployments answer with a
    // bare array. Both are accepted rather than assuming one shape.
    const raw: any[] = Array.isArray(result) ? result : result?.data || [];

    return raw.map((eventType) => ({
      id: eventType?.id,
      title: eventType?.title,
      slug: eventType?.slug,
      length: eventType?.length ?? eventType?.lengthInMinutes,
      description: eventType?.description,
      hidden: eventType?.hidden,
    }));
  },

  /**
   * Free slots for an event type. Availability is computed by Cal.com against
   * calendars erxes cannot see, so it is asked for rather than derived.
   */
  calcomSlots: async (
    _parent: undefined,
    {
      eventTypeId,
      start,
      end,
      timeZone,
    }: { eventTypeId: number; start: string; end: string; timeZone?: string },
    { models }: IContext,
  ) => {
    const result = await getCalcomSlots(models, {
      eventTypeId,
      start,
      end,
      timeZone,
    });

    const payload = result?.data ?? result;

    // v2 returns slots keyed by date — { "2026-08-04": [{ start }, ...] } —
    // rather than a flat list, so the day buckets are flattened. An array is
    // still handled for deployments that answer with one.
    const raw: any[] = Array.isArray(payload)
      ? payload
      : Object.values(payload || {}).flatMap((day) =>
          Array.isArray(day) ? day : [],
        );

    return raw
      .map((slot) => ({
        start: slot?.start ?? slot?.time,
        end: slot?.end,
      }))
      .filter((slot) => !!slot.start);
  },

  /**
   * Which integration settings are configured, and from where.
   *
   * Values are never returned — see the CalcomConfigStatus doc in the schema.
   */
  calcomConfigStatus: async (
    _parent: undefined,
    _args: undefined,
    { models }: IContext,
  ) => getCalcomConfigStatus(models),
};
