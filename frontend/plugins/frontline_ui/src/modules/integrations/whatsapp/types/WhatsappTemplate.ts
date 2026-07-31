/**
 * Approved template shapes, mirroring what `whatsappTemplates` returns.
 * https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
 */
export type WhatsappTemplateComponentType =
  | 'HEADER'
  | 'BODY'
  | 'FOOTER'
  | 'BUTTONS';

export interface IWhatsappTemplateComponent {
  type: WhatsappTemplateComponentType;
  format?: string;
  text?: string;
}

export interface IWhatsappTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: IWhatsappTemplateComponent[];
}

/** A connected number a new conversation can be started from. */
export interface IWhatsappSenderIntegration {
  _id: string;
  name: string;
  displayPhoneNumber?: string | null;
}

/** Send-time parameters; positional `{{n}}` are filled by array order. */
export interface IWhatsappTemplateSendComponent {
  type: 'header' | 'body';
  parameters: Array<{ type: 'text'; text: string }>;
}

export interface IWhatsappTemplateDispatch {
  name: string;
  languageCode: string;
  components?: IWhatsappTemplateSendComponent[];
}
