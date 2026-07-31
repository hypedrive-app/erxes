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

  createdAt: { type: Date, label: 'Created At' },
  updatedAt: { type: Date, label: 'Updated At' },
});

// One endpoint per agent per integration. The unique index is what makes the
// upsert in `ensurePlivoEndpoint` safe against two browser tabs provisioning at
// the same moment — without it both would insert and the second registration
// would silently use a row the first had already superseded.
endpointCredentialSchema.index({ integrationId: 1, userId: 1 }, { unique: true });
