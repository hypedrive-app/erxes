import { Document, Model } from 'mongoose';

import { calcomConfigSchema } from '@/bookings/db/definitions/calcomConfigs';
import { IModels } from '~/connectionResolvers';

export interface ICalcomConfig {
  code: string;
  value?: string;
}

export interface ICalcomConfigDocument extends ICalcomConfig, Document {
  _id: string;
}

export interface ICalcomConfigsModel extends Model<ICalcomConfigDocument> {
  setConfig(code: string, value?: string): Promise<ICalcomConfigDocument | null>;
}

export const loadCalcomConfigsClass = (models: IModels) => {
  class CalcomConfigs {
    /**
     * Sets or clears one config value.
     *
     * Clearing DELETES the row rather than storing an empty string, which is
     * what makes the env fallback reachable again: getCalcomConfig treats a
     * stored empty value as unset, but leaving the row behind would keep the
     * settings UI reporting the value as "database"-sourced when it is really
     * falling through to the environment.
     */
    public static async setConfig(code: string, value?: string) {
      if (!value) {
        await models.CalcomConfigs.deleteOne({ code });
        return null;
      }

      return models.CalcomConfigs.findOneAndUpdate(
        { code },
        { $set: { value } },
        // upsert + new: the row may not exist yet, and callers want the value
        // that was actually stored back.
        { upsert: true, new: true },
      );
    }
  }

  calcomConfigSchema.loadClass(CalcomConfigs);

  return calcomConfigSchema;
};
