import { IContext } from '~/connectionResolvers';

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
};
