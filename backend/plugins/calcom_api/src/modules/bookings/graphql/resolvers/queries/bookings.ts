
  import { IContext } from '~/connectionResolvers';

   export const bookingsQueries = {
    getBookings: async (_parent: undefined, { _id }, { models }: IContext) => {
      return models.Bookings.getBookings(_id);
    },
    
    getBookingss: async (_parent: undefined, { models }: IContext) => {
      return models.Bookings.getBookingss();
    },
  };
