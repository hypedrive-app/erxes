import { Model } from 'mongoose';
import { IModels } from '~/connectionResolvers';
import { integrationSchema } from '@/integrations/plivo/db/definitions/integrations';
import { IPlivoIntegrationDocument } from '@/integrations/plivo/@types';

export interface IPlivoIntegrationModel
  extends Model<IPlivoIntegrationDocument> {
  getIntegration(selector): Promise<IPlivoIntegrationDocument>;
}

export const loadPlivoIntegrationClass = (models: IModels) => {
  class Integration {
    public static async getIntegration(selector) {
      const integration = await models.PlivoIntegrations.findOne(selector);

      if (!integration) {
        throw new Error('Integration not found');
      }

      return integration;
    }
  }

  integrationSchema.loadClass(Integration);

  return integrationSchema;
};
