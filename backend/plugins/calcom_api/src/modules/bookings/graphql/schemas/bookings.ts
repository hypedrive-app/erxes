export const types = `
  type Bookings {
    _id: String
    name: String
    description: String
  }
`;

export const queries = `
  getBookings(_id: String!): Bookings
  getBookingss: [Bookings]
`;

export const mutations = `
  createBookings(name: String!): Bookings
  updateBookings(_id: String!, name: String!): Bookings
  removeBookings(_id: String!): Bookings
`;
