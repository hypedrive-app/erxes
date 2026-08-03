import { createGenerateModels } from 'erxes-api-shared/utils';
import { IMainContext } from 'erxes-api-shared/core-types';
import { IBookingsDocument } from '@/bookings/@types/bookings';

import mongoose from 'mongoose';

// Bookings, not bookings: create-plugin emits the model file PascalCased but
// imports it lowercased, which only fails on a case-sensitive filesystem.
import { loadBookingsClass, IBookingsModel } from '@/bookings/db/models/Bookings';
import {
  ICalcomConfigDocument,
  ICalcomConfigsModel,
  loadCalcomConfigsClass,
} from '@/bookings/db/models/CalcomConfigs';

export interface IModels {
  Bookings: IBookingsModel;
  CalcomConfigs: ICalcomConfigsModel;
}

export interface IContext extends IMainContext {
  models: IModels;
}

export const loadClasses = (db: mongoose.Connection): IModels => {
  const models = {} as IModels;

  models.Bookings = db.model<IBookingsDocument, IBookingsModel>(
    'bookings',
    loadBookingsClass(models),
  );

  models.CalcomConfigs = db.model<ICalcomConfigDocument, ICalcomConfigsModel>(
    'calcom_configs',
    loadCalcomConfigsClass(models),
  );

  return models;
};

export const generateModels = createGenerateModels<IModels>(loadClasses);
