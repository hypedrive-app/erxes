import { Model } from 'mongoose';
import { IModels } from '~/connectionResolvers';
import { customerSchema } from '@/integrations/plivo/db/definitions/customers';
import { IPlivoCustomerDocument } from '@/integrations/plivo/@types';

export interface IPlivoCustomerModel extends Model<IPlivoCustomerDocument> {
  getCustomer(selector: any): Promise<IPlivoCustomerDocument>;
}

export const loadPlivoCustomerClass = (models: IModels) => {
  class Customer {
    public static async getCustomer(selector: any) {
      const customer = await models.PlivoCustomers.findOne(selector);

      if (!customer) {
        throw new Error('Customer not found');
      }

      return customer;
    }
  }

  customerSchema.loadClass(Customer);

  return customerSchema;
};
