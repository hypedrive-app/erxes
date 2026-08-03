import { Model } from 'mongoose';
import { IModels } from '~/connectionResolvers';
import { bookingsSchema } from '@/bookings/db/definitions/bookings';
import { IBookings, IBookingsDocument } from '@/bookings/@types/bookings';

export interface IBookingsModel extends Model<IBookingsDocument> {
  getBookings(_id: string): Promise<IBookingsDocument>;
  getBookingss(): Promise<IBookingsDocument[]>;
  createBookings(doc: IBookings): Promise<IBookingsDocument>;
  updateBookings(_id: string, doc: IBookings): Promise<IBookingsDocument>;
  removeBookings(BookingsId: string): Promise<{  ok: number }>;
}

export const loadBookingsClass = (models: IModels) => {
  class Bookings {
    /**
     * Retrieves calcom
     */
    public static async getBookings(_id: string) {
      const Bookings = await models.Bookings.findOne({ _id }).lean();

      if (!Bookings) {
        throw new Error('Bookings not found');
      }

      return Bookings;
    }

    /**
     * Retrieves all calcoms
     */
    public static async getBookingss(): Promise<IBookingsDocument[]> {
      return models.Bookings.find().lean();
    }

    /**
     * Create a calcom
     */
    public static async createBookings(doc: IBookings): Promise<IBookingsDocument> {
      return models.Bookings.create(doc);
    }

    /*
     * Update calcom
     */
    public static async updateBookings(_id: string, doc: IBookings) {
      return await models.Bookings.findOneAndUpdate(
        { _id },
        { $set: { ...doc } },
      );
    }

    /**
     * Remove calcom
     */
    public static async removeBookings(BookingsId: string[]) {
      return models.Bookings.deleteOne({ _id: { $in: BookingsId } });
    }
  }

  bookingsSchema.loadClass(Bookings);

  return bookingsSchema;
};
