import { Document } from 'mongoose';

export interface IBookings {
  name?: string;
}

export interface IBookingsDocument extends IBookings, Document {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}
