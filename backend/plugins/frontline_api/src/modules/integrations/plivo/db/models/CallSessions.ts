import { Model } from 'mongoose';
import { IModels } from '~/connectionResolvers';
import { callSessionSchema } from '@/integrations/plivo/db/definitions/callSessions';
import {
  IPlivoCallSession,
  IPlivoCallSessionDocument,
} from '@/integrations/plivo/@types';

export interface IPlivoCallSessionModel
  extends Model<IPlivoCallSessionDocument> {
  getCallSession(selector): Promise<IPlivoCallSessionDocument>;
  addCallSession(doc: IPlivoCallSession): Promise<IPlivoCallSessionDocument>;
}

export const loadPlivoCallSessionClass = (models: IModels) => {
  class CallSession {
    public static async getCallSession(selector) {
      const session = await models.PlivoCallSessions.findOne(selector);

      if (!session) {
        throw new Error('Call session not found');
      }

      return session;
    }

    /**
     * Insert a call, tolerating Plivo re-delivering the same callback.
     *
     * Plivo retries a callback whenever our reply is slow or non-2xx, so the
     * same `CallUUID` can arrive more than once. It is uniquely indexed; on a
     * duplicate the existing row is returned instead of throwing, which makes
     * the retry a no-op rather than a 500 that triggers yet another retry.
     */
    public static async addCallSession(doc: IPlivoCallSession) {
      try {
        return await models.PlivoCallSessions.create({
          ...doc,
          createdAt: doc.createdAt || new Date(),
          updatedAt: new Date(),
        });
      } catch (e: any) {
        if (e.message?.includes('duplicate')) {
          return await models.PlivoCallSessions.getCallSession({
            callUuid: doc.callUuid,
          });
        }

        throw e;
      }
    }
  }

  callSessionSchema.loadClass(CallSession);

  return callSessionSchema;
};
