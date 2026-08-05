import { Schema } from 'mongoose';
import { mongooseStringRandomId, schemaWrapper } from 'erxes-api-shared/utils';
import { attachmentSchema } from 'erxes-api-shared/core-modules';

export const commentConversationSchema = schemaWrapper(
  new Schema({
    _id: mongooseStringRandomId,
    mid: { type: String, label: 'comment message id' },
    postId: { type: String },
    // `unique` closes the check-then-act race in store.ts's
    // `getOrCreateComment`, which findOne's on `comment_id` and then creates —
    // Meta gives no dedup or ordering guarantee, so two deliveries of the same
    // comment webhook can both pass that findOne and both insert. This is the
    // field the dedup actually keys on; it is also Meta's own id for the
    // comment, so it is genuinely unique per document.
    //
    // `sparse` because a document is only ever written here with a
    // `comment_id` from a webhook payload, but nothing enforces its presence
    // at the schema level, and a non-sparse unique index treats every missing
    // value as the same value — one malformed payload without a comment_id
    // would then block every subsequent one.
    comment_id: { type: String, unique: true, sparse: true },
    parentId: { type: String, default: '' },
    recipientId: { type: String },
    senderId: { type: String },
    content: String,
    erxesApiId: String,
    customerId: { type: String, optional: true },
    isResolved: { type: Boolean, default: false },
    timestamp: { type: Date },
    createdAt: { type: Date, default: Date.now, label: 'Created At' },
    updatedAt: { type: Date, index: true, label: 'Updated At' },
    attachments: [attachmentSchema],
  }),
);
