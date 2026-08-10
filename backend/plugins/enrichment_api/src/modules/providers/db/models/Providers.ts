import { Model } from 'mongoose';

import { IModels } from '~/connectionResolvers';
import {
  enrichmentConfigSchema,
  enrichmentLogSchema,
} from '@/providers/db/definitions/providers';
import {
  IEnrichmentConfigDocument,
  IEnrichmentLog,
  IEnrichmentLogDocument,
} from '@/providers/@types/providers';

export interface IEnrichmentConfigModel
  extends Model<IEnrichmentConfigDocument> {
  setConfig(code: string, value: string): Promise<IEnrichmentConfigDocument>;
}

export const loadEnrichmentConfigClass = (models: IModels) => {
  class EnrichmentConfig {
    /**
     * Upsert, so the settings form can be submitted repeatedly without the
     * caller having to know whether a row already exists.
     *
     * An empty value DELETES rather than storing '' — that is what makes
     * "clear this key" fall back to the environment default instead of
     * shadowing it with a blank string that reads as configured.
     */
    public static async setConfig(code: string, value: string) {
      if (!value) {
        await models.EnrichmentConfigs.deleteOne({ code });
        return null;
      }

      return models.EnrichmentConfigs.findOneAndUpdate(
        { code },
        { $set: { code, value } },
        { upsert: true, new: true },
      );
    }
  }

  enrichmentConfigSchema.loadClass(EnrichmentConfig);

  return enrichmentConfigSchema;
};

export interface IEnrichmentLogModel extends Model<IEnrichmentLogDocument> {
  record(doc: IEnrichmentLog): Promise<IEnrichmentLogDocument>;
  lastFor(
    contentType: string,
    contentId: string,
  ): Promise<IEnrichmentLogDocument[]>;
}

export const loadEnrichmentLogClass = (models: IModels) => {
  class EnrichmentLog {
    public static async record(doc: IEnrichmentLog) {
      return models.EnrichmentLogs.create({ ...doc, createdAt: new Date() });
    }

    /**
     * Recent attempts against one record, newest first — this is what the
     * widget shows so an operator can see that a provider already missed
     * rather than pressing the button again and spending another credit.
     */
    public static async lastFor(contentType: string, contentId: string) {
      return models.EnrichmentLogs.find({ contentType, contentId })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
    }
  }

  enrichmentLogSchema.loadClass(EnrichmentLog);

  return enrichmentLogSchema;
};
