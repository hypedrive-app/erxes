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

  // `sparse` so an integration stored without a number does not claim the
  // shared `null` key and block every other one from being created.
  plivoPhoneNumber: {
    type: String,
    unique: true,
    sparse: true,
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

  // Where an inbound call is actually bridged. Without it the caller hears the
  // hold prompt and then nothing — the call is logged but nobody is rung, which
  // reads as a dropped call to whoever dialled in.
  //
  // A plain phone number in E.164 (agents answer on their handset). Left empty,
  // the previous announce-only behaviour is kept rather than failing the call.
  forwardToNumber: {
    type: String,
    label: 'Forward inbound calls to this number (E.164)',
    optional: true,
  },

  // How long to ring the agent before giving up, in seconds. Plivo's own
  // default is 30, which is short for a mobile that may be in a pocket.
  forwardTimeout: {
    type: Number,
    label: 'Seconds to ring the agent before giving up',
    optional: true,
  },

  // Ring the browser softphones of agents who are actually registered before
  // falling back to `forwardToNumber`. Unset is treated as ON, so an existing
  // integration starts reaching its logged-in agents without being re-saved.
  ringAgents: {
    type: Boolean,
    label: 'Ring logged-in agents before the fallback number',
    optional: true,
  },

  // Per-stage ring time. Two short stages beat one long one: a caller left
  // ringing for 45s with no way to leave a message hangs up and is lost.
  agentRingTimeout: {
    type: Number,
    label: 'Seconds to ring logged-in agents',
    optional: true,
  },

  // A voicemail is what stops an unanswered call from vanishing. Unset is
  // treated as ON, because dropping the caller is never the better default.
  voicemailEnabled: {
    type: Boolean,
    label: 'Take a voicemail when nobody answers',
    optional: true,
  },
  voicemailMaxLength: {
    type: Number,
    label: 'Maximum voicemail length in seconds',
    optional: true,
  },
  voicemailGreeting: {
    type: String,
    label: 'Prompt read to the caller before the voicemail beep',
    optional: true,
  },

  healthStatus: String,
  error: String,
});
