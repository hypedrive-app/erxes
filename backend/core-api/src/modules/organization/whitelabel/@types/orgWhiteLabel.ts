import { Document } from 'mongoose';

export interface IOrgWhiteLabel {
  orgLogo?: string;
  orgLoginText?: string;
  orgLoginDescription?: string;
  orgFavicon?: string;
  orgShortDescription?: string;
  orgShortName?: string;
  /** Hex, e.g. "#3B90FA". Converted to oklch in the browser when applied. */
  orgAccentColor?: string;
  enabled?: boolean;
}

export interface IOrgWhiteLabelDocument extends Document, IOrgWhiteLabel {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}
