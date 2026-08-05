import { Schema } from 'mongoose';
import { attachmentSchema } from 'erxes-api-shared/core-modules';
import { mongooseStringRandomId } from 'erxes-api-shared/utils';

export const commentConversationSchema = new Schema({
  _id: mongooseStringRandomId,
  mid: { type: String, label: 'comment message id' },
  postId: { type: String },
  // `unique` closes the check-then-act race in store.ts's `getOrCreateComment`,
  // which findOne's on `comment_id` and then creates — Meta gives no dedup or
  // ordering guarantee, so two deliveries of the same comment webhook can both
  // pass that findOne and both insert. This is the field the dedup keys on and
  // it is Meta's own comment id, so it is genuinely unique per document.
  //
  // `sparse` because nothing enforces comment_id's presence at the schema
  // level, and a non-sparse unique index treats every missing value as the
  // same value — one malformed payload without a comment_id would then block
  // every subsequent one.
  comment_id: { type: String, unique: true, sparse: true },
  recipientId: { type: String },
  senderId: { type: String },
  content: String,
  erxesApiId: String,
  customerId: { type: String, optional: true },
  parentId: String,
  integrationId: String,
  createdAt: { type: Date, default: Date.now, label: 'Created At' },
  updatedAt: { type: Date, index: true, label: 'Updated At' },
  attachments: [attachmentSchema],
});
