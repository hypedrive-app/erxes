import { Schema } from 'mongoose';
import { mongooseStringRandomId } from 'erxes-api-shared/utils';

/**
 * The SIP password one agent's browser softphone registers with.
 *
 * This exists because Plivo's endpoint password is WRITE-ONLY in practice.
 * `POST /Endpoint/{id}/` accepts a new password and answers
 * `{"message":"changed"}`, but a subsequent `GET` still returns the OLD value —
 * and registering with what `GET` returns fails with `Authentication Error`
 * while the value just POSTed succeeds. So the password Plivo will actually
 * accept exists nowhere except in the process that set it, and it has to be
 * kept here or the browser can never log in again.
 *
 * It lives in its OWN collection rather than on the integration row because it
 * is per-agent, not per-number: `plivoIntegrationConfigs` returns the whole
 * integration document's fields to any logged-in operator, and a password
 * carried on that row would be one careless field addition away from being
 * handed to every other agent. A separate collection means the credential is
 * only ever reachable through a query that names both the integration AND the
 * requesting user.
 *
 * Stored as plaintext, matching `authToken` on the integration row — the
 * account-wide secret this same database already holds, which is strictly more
 * dangerous than one endpoint's password. Encrypting only this field would be
 * theatre: the key would have to live in the same environment as the data, and
 * the account credential sitting beside it in the same database would remain
 * readable anyway. The real containment is that it never leaves the server
 * except to the one agent it belongs to, and is never logged.
 */
export const endpointCredentialSchema = new Schema({
  _id: mongooseStringRandomId,

  integrationId: { type: String, index: true, label: 'Inbox integration id' },
  userId: { type: String, index: true, label: 'Erxes user id' },

  endpointId: { type: String, label: 'Plivo endpoint id, used to rotate' },
  // The name Plivo assigned — the requested stem with 12 digits appended. This
  // is what registers and what `<Dial><User>` must target.
  username: { type: String, label: 'SIP username Plivo assigned' },
  alias: { type: String, label: 'Alias identifying an endpoint we provisioned' },

  password: { type: String, label: 'SIP password — write-only at Plivo' },

  /**
   * Where this agent wants to be reached.
   *
   * Routing used to have exactly one signal — whether the agent's browser was
   * SIP-registered — which cannot express the two cases that matter most: an
   * agent whose network cannot carry WebRTC audio (a call rings, is answered,
   * and is silent), and an agent who would rather take calls on a handset. A
   * registered browser was assumed to be the only place worth ringing.
   *
   * `browser` keeps the previous behaviour and stays the default, so an agent
   * who never opens these settings is routed exactly as before.
   */
  device: {
    type: String,
    enum: ['browser', 'phone', 'both'],
    label: 'Where to ring this agent',
    optional: true,
  },

  /**
   * The handset to ring for `phone` or `both`, in E.164.
   *
   * Held per agent rather than read from their erxes profile: the number a
   * person takes support calls on is not necessarily the one on their staff
   * record, and inheriting it silently would start ringing a personal phone
   * nobody agreed to expose.
   */
  phoneNumber: {
    type: String,
    label: 'Handset to ring, E.164',
    optional: true,
  },

  /**
   * Whether this agent is taking calls at all.
   *
   * Separate from SIP registration, which only says a browser tab is open —
   * it cannot distinguish an agent at their desk from one at lunch with the
   * tab still up. Absent means available, so nobody stops receiving calls
   * because a field was added.
   */
  available: {
    type: Boolean,
    label: 'Accepting calls',
    optional: true,
  },

  createdAt: { type: Date, label: 'Created At' },
  updatedAt: { type: Date, label: 'Updated At' },
});

// One endpoint per agent per integration. The unique index is what makes the
// upsert in `ensurePlivoEndpoint` safe against two browser tabs provisioning at
// the same moment — without it both would insert and the second registration
// would silently use a row the first had already superseded.
endpointCredentialSchema.index({ integrationId: 1, userId: 1 }, { unique: true });
