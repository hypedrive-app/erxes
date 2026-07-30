import { Schema } from 'mongoose';
import { mongooseStringRandomId } from 'erxes-api-shared/utils';

/**
 * A connected Plivo voice number.
 *
 * `authId`/`authToken` are the account credentials used for HTTP Basic auth on
 * every REST call, and the auth token doubles as the HMAC key that verifies
 * inbound callbacks — so it is a shared secret, never sent anywhere but Plivo.
 *
 * `plivoPhoneNumber` is the rented number in E.164; it is both the caller id on
 * outbound calls and the routing key that matches an inbound callback to this
 * integration, so it must be unique across integrations.
 */
export const integrationSchema = new Schema({
  _id: mongooseStringRandomId,
  kind: String,
  erxesApiId: String,

  authId: { type: String, label: 'Plivo account auth id' },
  authToken: {
    type: String,
    label: 'Plivo auth token — also the callback HMAC key',
  },

  plivoPhoneNumber: {
    type: String,
    unique: true,
    label: 'Rented Plivo number in E.164',
  },
  appId: {
    type: String,
    label: 'Plivo application id that owns the callback URLs',
    optional: true,
  },

  // Callers dial in national format as often as international; this lets both
  // be normalised to one E.164 form so the same person is not created twice.
  defaultCountryCode: {
    type: String,
    label: 'Default country code, digits only (e.g. 91)',
    optional: true,
  },

  recordCalls: {
    type: Boolean,
    label: 'Record answered calls',
    optional: true,
  },

  healthStatus: String,
  error: String,
});
