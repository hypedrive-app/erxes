import { Schema } from 'mongoose';
import { mongooseStringRandomId } from 'erxes-api-shared/utils';

/**
 * Plugin-local shadow of a core contact, keyed by the caller's phone number.
 *
 * The key is stored ALREADY NORMALISED to E.164 (see `normalizePhone`) rather
 * than as Plivo delivered it: core de-duplicates contacts by exact string match
 * on `primaryPhone` with no unique index to catch a mismatch, so a caller who
 * also messages on WhatsApp must produce the identical string here or they
 * become two contacts.
 */
export const customerSchema = new Schema({
  _id: mongooseStringRandomId,
  // `sparse` so a row without a number cannot collide with every other such
  // row on a shared `null` key. Callers still guard against the empty string,
  // which `sparse` does NOT exempt — `normalizePhone` returns `''` for
  // unusable input and two of those WOULD collide.
  phoneNumber: {
    type: String,
    unique: true,
    sparse: true,
    label: 'Caller number, normalised to E.164',
  },
  erxesApiId: { type: String, label: 'Customer id at contacts-api' },
  primaryPhone: { type: String, label: 'Normalised E.164 phone number' },
  firstName: String,
  lastName: String,
  integrationId: { type: String, label: 'Inbox integration id' },
});
