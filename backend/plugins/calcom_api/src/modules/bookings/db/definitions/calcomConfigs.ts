import { mongooseStringRandomId } from 'erxes-api-shared/utils';
import { Schema } from 'mongoose';

/**
 * Stored Cal.com integration settings.
 *
 * Mirrors frontline's instagram config collection (a `code`/`value` pair keyed
 * by a unique code) so this plugin resolves credentials the same way the rest
 * of erxes does: stored value first, environment as the fallback. Env-only
 * settings can only be rotated by editing Dokploy and redeploying, which is a
 * poor answer for a leaked API key.
 *
 * `value` is a String, not the Object frontline uses: every code here is a
 * scalar (a key, a URL, a 'true'/'false' flag), and typing it loosely would
 * only invite storing shapes the readers do not expect.
 */
export const calcomConfigSchema = new Schema(
  {
    _id: mongooseStringRandomId,
    code: { type: String, unique: true, required: true },
    value: { type: String },
  },
  {
    timestamps: true,
  },
);
