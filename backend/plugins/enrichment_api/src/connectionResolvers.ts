import { createGenerateModels } from 'erxes-api-shared/utils';
import { IMainContext } from 'erxes-api-shared/core-types';
import mongoose from 'mongoose';

import {
  IEnrichmentConfigDocument,
  IEnrichmentLogDocument,
} from '@/providers/@types/providers';
import {
  IEnrichmentConfigModel,
  IEnrichmentLogModel,
  loadEnrichmentConfigClass,
  loadEnrichmentLogClass,
} from '@/providers/db/models/Providers';

export interface IModels {
  EnrichmentConfigs: IEnrichmentConfigModel;
  EnrichmentLogs: IEnrichmentLogModel;
}

export interface IContext extends IMainContext {
  models: IModels;
  // Set in main.ts's apolloServerContext. Not on IMainContext, but every
  // resolver in this plugin needs it to address core over tRPC.
  subdomain: string;
}

export const loadClasses = (db: mongoose.Connection): IModels => {
  const models = {} as IModels;

  // Collection names are prefixed so they are recognisable in a shared
  // database — every plugin's collections live in the same Mongo database.
  models.EnrichmentConfigs = db.model<
    IEnrichmentConfigDocument,
    IEnrichmentConfigModel
  >('enrichment_configs', loadEnrichmentConfigClass(models));

  models.EnrichmentLogs = db.model<
    IEnrichmentLogDocument,
    IEnrichmentLogModel
  >('enrichment_logs', loadEnrichmentLogClass(models));

  return models;
};

export const generateModels = createGenerateModels<IModels>(loadClasses);
