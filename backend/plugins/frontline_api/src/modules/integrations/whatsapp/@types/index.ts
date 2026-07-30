import { Document } from 'mongoose';

export interface IWhatsappIntegration {
  kind: string;
  erxesApiId: string;
  phoneNumberId: string;
  whatsappBusinessAccountId?: string;
  displayPhoneNumber?: string;
  accessToken: string;
  appSecret?: string;
  verifyToken?: string;
  defaultCountryCode?: string;
  healthStatus?: string;
  error?: string;
}

export interface IWhatsappIntegrationDocument
  extends IWhatsappIntegration,
    Document {
  _id: string;
}

export interface IWhatsappCustomer {
  waId: string;
  erxesApiId?: string;
  primaryPhone?: string;
  firstName?: string;
  lastName?: string;
  integrationId: string;
}

export interface IWhatsappCustomerDocument
  extends IWhatsappCustomer,
    Document {
  _id: string;
}

export interface IWhatsappConversation {
  erxesApiId?: string;
  timestamp: Date;
  senderId: string;
  recipientId: string;
  integrationId: string;
  content?: string;
  lastCustomerMessageAt?: Date;
}

export interface IWhatsappConversationDocument
  extends IWhatsappConversation,
    Document {
  _id: string;
}

export interface IWhatsappConversationMessage {
  mid: string;
  content?: string;
  attachments?: any[];
  conversationId: string;
  customerId?: string;
  userId?: string;
  deliveryStatus?: string;
  errorMessage?: string;
  internal?: boolean;
}

export interface IWhatsappConversationMessageDocument
  extends IWhatsappConversationMessage,
    Document {
  _id: string;
}

/**
 * The subset of Meta's webhook payload this module consumes.
 * Shape: entry[] -> changes[] -> value -> { messages[] | statuses[] }
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export interface IWhatsappWebhookMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

export interface IWhatsappWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: IWhatsappWebhookMedia;
  video?: IWhatsappWebhookMedia;
  audio?: IWhatsappWebhookMedia;
  document?: IWhatsappWebhookMedia;
  sticker?: IWhatsappWebhookMedia;
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  reaction?: { message_id: string; emoji?: string };
  context?: { id?: string; from?: string };
}

export interface IWhatsappWebhookStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

export interface IWhatsappWebhookValue {
  messaging_product: string;
  metadata: { display_phone_number?: string; phone_number_id: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
  messages?: IWhatsappWebhookMessage[];
  statuses?: IWhatsappWebhookStatus[];
}

export interface IWhatsappWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value: IWhatsappWebhookValue }>;
  }>;
}
