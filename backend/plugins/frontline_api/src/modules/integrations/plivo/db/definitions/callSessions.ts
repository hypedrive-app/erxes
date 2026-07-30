import { Schema } from 'mongoose';
import { mongooseStringRandomId } from 'erxes-api-shared/utils';

/**
 * One call — its whole lifecycle plus the history row the inbox renders.
 *
 * `callUuid` is Plivo's identifier for the call and is uniquely indexed. That
 * uniqueness is what makes a redelivered callback a no-op: Plivo retries a
 * callback when our answer is slow or non-2xx, and without the unique index the
 * same call would be written twice and appear twice in the agent's history.
 */
export const callSessionSchema = new Schema({
  _id: mongooseStringRandomId,
  // `sparse` so a row that somehow reaches the collection without a CallUUID
  // does not collide with every other such row on a shared `null` key — the
  // classic empty-key collision that makes unrelated calls echo each other.
  callUuid: {
    type: String,
    unique: true,
    sparse: true,
    label: 'Plivo CallUUID',
  },

  // Set once the inbox has accepted the call; its absence marks a row stored
  // locally but never delivered upstream.
  erxesApiConversationId: { type: String, label: 'Inbox conversation id' },
  erxesApiMessageId: { type: String, label: 'Inbox message id' },

  integrationId: { type: String, index: true, label: 'Inbox integration id' },
  customerId: { type: String, index: true, label: 'Customer id at contacts-api' },
  userId: { type: String, index: true, label: 'Erxes user who placed the call' },

  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    index: true,
    label: 'Call direction as Plivo reports it',
  },
  status: {
    type: String,
    enum: [
      'ringing',
      'in-progress',
      'completed',
      'no-answer',
      'busy',
      'failed',
    ],
    index: true,
    label: 'Latest known call status',
  },

  // Both normalised to E.164 so call history can be matched to a contact.
  from: { type: String, index: true, label: 'Caller number in E.164' },
  to: { type: String, index: true, label: 'Called number in E.164' },

  duration: { type: Number, label: 'Seconds connected', optional: true },
  billDuration: { type: Number, label: 'Seconds billed', optional: true },
  totalCost: { type: Number, label: 'Cost reported by Plivo', optional: true },
  hangupCause: {
    type: String,
    label: 'Why the call ended — the only way to detect a missed call',
    optional: true,
  },

  // What the player reads: an erxes storage key once the recording has been
  // re-hosted, or Plivo's own URL when re-hosting failed. The frontend accepts
  // either, so the fallback still plays until the provider deletes the file.
  recordUrl: { type: String, label: 'Recording URL', optional: true },
  // Plivo stores recordings free for 90 days; past that they are billed or
  // auto-deleted depending on an account setting, so this URL expires. It is
  // kept alongside the durable copy so a failed re-host can be retried by hand.
  providerRecordUrl: {
    type: String,
    label: 'Recording URL as Plivo reported it',
    optional: true,
  },
  // Set only when `recordUrl` is a durable erxes storage key; its absence is
  // what marks a row still pointing at the expiring provider URL.
  recordingStoredAt: {
    type: Date,
    label: 'When the recording was copied into erxes storage',
    optional: true,
  },
  recordingUuid: { type: String, label: 'Plivo recording id', optional: true },
  recordingDuration: {
    type: Number,
    label: 'Recording length in seconds',
    optional: true,
  },

  startedAt: { type: Date, label: 'When the call began' },
  answeredAt: { type: Date, label: 'When the call was answered', optional: true },
  endedAt: { type: Date, label: 'When the call ended', optional: true },

  createdAt: { type: Date, index: true, label: 'Created At' },
  updatedAt: { type: Date, label: 'Updated At' },
});

// Call history is read newest-first per integration.
callSessionSchema.index({ integrationId: 1, createdAt: -1 });
