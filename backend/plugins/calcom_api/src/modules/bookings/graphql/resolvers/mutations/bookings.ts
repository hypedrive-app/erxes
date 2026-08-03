/**
 * No mutations.
 *
 * Cal.com owns bookings; this plugin mirrors them from webhooks, so there is
 * nothing here a user could safely create, edit or delete — any such write
 * would drift from Cal.com the moment it was made. Writing back into Cal.com is
 * a separate feature with its own conflict semantics.
 *
 * The generated createBookings/updateBookings/removeBookings stubs were removed
 * rather than left unused: keeping them would advertise a write path this
 * plugin does not have.
 */
export const bookingsMutations = {};
