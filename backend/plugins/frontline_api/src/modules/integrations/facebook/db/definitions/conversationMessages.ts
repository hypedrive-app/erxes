import { Schema } from 'mongoose';
import { attachmentSchema } from 'erxes-api-shared/core-modules';
import { mongooseStringRandomId } from 'erxes-api-shared/utils';

export const conversationMessageSchema = new Schema({
  _id: mongooseStringRandomId,
  // `unique` stops a redelivered webhook (Meta gives no dedup or ordering
  // guarantee) from being inserted twice — receiveMessage.ts's own
  // findOne-then-create is a check-then-act race, not an atomic guard, and
  // the unique index is what actually closes it. `sparse` rather than a
  // plain unique index: this same model stores INTERNAL notes too
  // (handleFacebookMessage.ts's `doc.internal` branch), which have no mid
  // at all — a plain unique index would collide every message document
  // whose mid is unset against every other one, since MongoDB treats
  // multiple missing values as identical for a non-sparse unique index.
  mid: {
    type: String,
    unique: true,
    sparse: true,
    label: 'Facebook message id',
  },
  content: { type: String },
  // the following derives from inbox
  attachments: [attachmentSchema],
  conversationId: { type: String, index: true },
  customerId: { type: String, index: true },
  visitorId: {
    type: String,
    index: true,
    label: 'unique visitor id on logger database',
  },
  fromBot: { type: Boolean },
  userId: { type: String, index: true },
  createdAt: { type: Date, index: true, label: 'Created At' },
  updatedAt: { type: Date, index: true, label: 'Updated At' },
  isCustomerRead: { type: Boolean, label: 'Is Customer Read' },
  internal: { type: Boolean, label: 'Internal' },
  botId: { type: String, label: 'Bot', optional: true },
  botData: { type: Object, optional: true },
  source: { type: Object, optional: true },
});
