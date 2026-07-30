import { Schema } from 'mongoose';
import { field } from '../utils';

export const integrationSchema = new Schema({
  _id: field({ pkey: true }),
  inboxId: field({ type: String, label: 'inbox id' }),
  wsServer: field({ type: String, label: 'web socket server' }),
  phone: field({ type: String, label: 'phone number' }),
  operators: field({ type: Object, label: 'Operator maps' }),
  token: field({ type: String, label: 'token' }),
  queues: field({ type: [String], label: 'queues' }),
  queueNames: field({ type: [String], label: 'queue names' }),
  srcTrunk: field({ type: String, label: 'inbound trunk name' }),
  dstTrunk: field({ type: String, label: 'outbound trunk name' }),
  // A PBX often reports numbers in national format (`09876543210`), which
  // carries no country. Without this the number cannot be resolved to E.164 and
  // the same person reaching us over call and over WhatsApp becomes two
  // contacts. Optional: when unset the previous digits-only behaviour is kept
  // rather than a country being guessed.
  defaultCountryCode: field({
    type: String,
    label: 'default country code, digits only (e.g. 91)',
    optional: true,
  }),
});

integrationSchema.index({ wsServer: 1, queues: 1 }, { unique: true });
integrationSchema.index({ srcTrunk: 1 }, { unique: true });
integrationSchema.index({ dstTrunk: 1 }, { unique: true });
