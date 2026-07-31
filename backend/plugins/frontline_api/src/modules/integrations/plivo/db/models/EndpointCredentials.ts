import { Model } from 'mongoose';
import { IModels } from '~/connectionResolvers';
import { endpointCredentialSchema } from '@/integrations/plivo/db/definitions/endpointCredentials';
import {
  IPlivoEndpointCredential,
  IPlivoEndpointCredentialDocument,
} from '@/integrations/plivo/@types';

export interface IPlivoEndpointCredentialModel
  extends Model<IPlivoEndpointCredentialDocument> {
  storeCredential(
    doc: IPlivoEndpointCredential,
  ): Promise<IPlivoEndpointCredentialDocument>;
}

export const loadPlivoEndpointCredentialClass = (models: IModels) => {
  class EndpointCredential {
    /**
     * Records the password an endpoint was just given.
     *
     * An upsert rather than an insert because rotation reuses the same
     * `{ integrationId, userId }` row: the endpoint at Plivo is the same one,
     * only its password changed, so a second row would leave a stale password
     * behind that a later read could pick instead of the live one.
     */
    public static async storeCredential(doc: IPlivoEndpointCredential) {
      const now = new Date();

      return await models.PlivoEndpointCredentials.findOneAndUpdate(
        { integrationId: doc.integrationId, userId: doc.userId },
        {
          $set: {
            endpointId: doc.endpointId,
            username: doc.username,
            alias: doc.alias,
            password: doc.password,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true, new: true },
      );
    }
  }

  endpointCredentialSchema.loadClass(EndpointCredential);

  return endpointCredentialSchema;
};
