import { Schema } from 'mongoose';
import { mongooseStringRandomId, schemaWrapper } from 'erxes-api-shared/utils';
import { attachmentSchema } from 'erxes-api-shared/core-modules';

export const commentConversationSchema = schemaWrapper(
  new Schema({
    _id: mongooseStringRandomId,
    // `unique` stops a redelivered webhook (Meta gives no dedup or ordering
    // guarantee) from being inserted twice — store.ts's `getOrCreateComment`
    // findOne-then-create (keyed on `comment_id`) is a check-then-act race,
    // not an atomic guard. `sparse` rather than a plain unique index: `mid`
    // is not currently populated on every comment document, so a plain
    // unique index would collide every document whose mid is unset against
    // every other one, since MongoDB treats multiple missing values as
    // identical for a non-sparse unique index.
    mid: {
      type: String,
      unique: true,
      sparse: true,
      label: 'comment message id',
    },
    postId: { type: String },
    comment_id: { type: String },
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
