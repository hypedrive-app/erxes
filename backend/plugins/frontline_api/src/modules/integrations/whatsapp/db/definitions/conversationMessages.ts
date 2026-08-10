import { Schema } from 'mongoose';
import { attachmentSchema } from 'erxes-api-shared/core-modules';
import { mongooseStringRandomId } from 'erxes-api-shared/utils';

/**
 * A single WhatsApp message, inbound or outbound.
 *
 * `mid` holds Meta's `wamid`, which is unique and is what delivery-status
 * webhooks (`sent`/`delivered`/`read`/`failed`) reference. It is indexed
 * uniquely because Meta gives no ordering or at-most-once guarantee — the same
 * message webhook can arrive twice, and the unique index is what stops a
 * duplicate being written.
 */
export const conversationMessageSchema = new Schema({
  _id: mongooseStringRandomId,
  mid: { type: String, unique: true, label: 'WhatsApp message id (wamid)' },
  // Set once the inbox has accepted the message; its absence marks a row that
  // was stored locally but never delivered upstream.
  erxesApiMessageId: { type: String, label: 'Inbox message id', optional: true },
  content: { type: String },
  attachments: [attachmentSchema],
  conversationId: { type: String, index: true },
  customerId: { type: String, index: true },
  userId: { type: String, index: true },
  createdAt: { type: Date, index: true, label: 'Created At' },
  updatedAt: { type: Date, index: true, label: 'Updated At' },
  // sent | delivered | read | played | failed — driven by the statuses webhook.
  deliveryStatus: {
    type: String,
    label: 'Latest delivery status reported by Meta',
    optional: true,
  },
  /**
   * How far along `deliveryStatus` is, so an out-of-order or redelivered
   * webhook cannot walk the message backwards. Stored rather than derived
   * because the comparison happens inside the update's own query, which
   * cannot call back into application code.
   */
  deliveryStatusRank: {
    type: Number,
    label: 'Ordering rank of the latest delivery status',
    optional: true,
  },
  errorMessage: {
    type: String,
    label: 'Populated when Meta reports the message failed',
    optional: true,
  },
  internal: { type: Boolean, label: 'Internal' },
  /**
   * The `wamid` of the message this one is a reply to — Meta's `context.id`
   * on an inbound swipe-to-reply, or the id we ourselves sent on `context` for
   * an outbound one. Stored as Meta's own id, not our `erxesApiMessageId`,
   * because that is the only identifier both directions agree on: an inbound
   * reply's `context.id` names a wamid that may belong to either party, and
   * resolving it to our own row happens at read time (see the `replyTo`
   * GraphQL resolver) rather than being duplicated here.
   */
  replyToMid: {
    type: String,
    label: 'wamid of the message this one replies to',
    optional: true,
  },
  /**
   * Emoji reactions attached to THIS message, keyed by who left them.
   *
   * Stored on the reacted-to message rather than as a message of its own,
   * because that is what a reaction is: WhatsApp renders it beneath the bubble
   * it belongs to, and giving it a row would put a bubble in the thread for
   * something the customer never sent as a message.
   *
   * `senderId` is the reactor's wa_id for a customer, or the erxes user id for
   * an agent, and is unique per row: WhatsApp allows one reaction per person
   * per message, so a second one replaces the first and an empty emoji from
   * that person removes it.
   *
   * `isCustomer` is stored rather than derived, because the two id spaces are
   * not comparable — a customer's wa_id is a phone number and an agent's is an
   * erxes user id, so nothing at read time could tell them apart.
   */
  reactions: {
    type: [
      new Schema(
        {
          senderId: { type: String, label: 'wa_id or erxes user id' },
          isCustomer: { type: Boolean, label: 'Left by the contact, not an agent' },
          emoji: { type: String, label: 'The reaction emoji' },
          reactedAt: { type: Date, label: 'When it was left' },
        },
        { _id: false },
      ),
    ],
    optional: true,
    label: 'Emoji reactions left on this message',
  },
});
