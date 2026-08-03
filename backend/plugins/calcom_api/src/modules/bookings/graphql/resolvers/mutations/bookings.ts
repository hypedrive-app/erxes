
  import { IContext } from '~/connectionResolvers';

  export const bookingsMutations = {
    createBookings: async (_parent: undefined, { name }, { models }: IContext) => {
      return models.Bookings.createBookings({name});
    },

    updateBookings: async (_parent: undefined, { _id, name }, { models }: IContext) => {
      return models.Bookings.updateBookings(_id, {name});
    },

    removeBookings: async (_parent: undefined, { _id }, { models }: IContext) => {
      return models.Bookings.removeBookings(_id);
    },
  };

