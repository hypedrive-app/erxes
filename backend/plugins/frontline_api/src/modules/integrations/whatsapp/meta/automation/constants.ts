import {
  WHATSAPP_MESSAGE_ACTION_METHOD,
  WHATSAPP_MESSAGE_COLLECTION,
  WHATSAPP_MODULE_NAME,
} from '@/integrations/whatsapp/constants';

// Trigger fields, addressable in actions as {{ trigger.<key> }} — e.g.
// {{ trigger.content }} feeds the AI Agent input.
//
// Every key here must exist on TWhatsappTriggerTarget and be populated by the
// emitter: the builder offers these to the user as available variables, so a
// key declared but never set renders as an empty string at run time with no
// error anywhere.
const whatsappMessageTriggerOutput = {
  variables: [
    { key: '_id', label: 'Message ID' },
    { key: 'content', label: 'Message content' },
    { key: 'conversationId', label: 'Conversation ID' },
    { key: 'customerId', label: 'Customer ID' },
    { key: 'from', label: 'Customer WhatsApp number' },
    { key: 'phoneNumberId', label: 'Business phone number ID' },
    { key: 'createdAt', label: 'Message created at' },
  ],
};

// Fields an action step exposes to whatever follows it.
const whatsappMessageActionOutput = {
  variables: [
    { key: 'messageId', label: 'Sent message ID' },
    { key: 'mid', label: 'WhatsApp message ID (wamid)' },
    { key: 'content', label: 'Sent message content' },
    { key: 'conversationId', label: 'Conversation ID' },
  ],
};

export const whatsappConstants = {
  actions: [
    {
      moduleName: WHATSAPP_MODULE_NAME,
      collectionName: WHATSAPP_MESSAGE_COLLECTION,
      method: WHATSAPP_MESSAGE_ACTION_METHOD,
      icon: 'IconBrandWhatsapp',
      label: 'Send WhatsApp Message',
      description:
        'Reply to the customer on WhatsApp. Subject to the 24-hour customer service window.',
      output: whatsappMessageActionOutput,
    },
  ],
  triggers: [
    {
      moduleName: WHATSAPP_MODULE_NAME,
      collectionName: WHATSAPP_MESSAGE_COLLECTION,
      icon: 'IconBrandWhatsapp',
      label: 'WhatsApp Message',
      description:
        'Start this workflow when a customer sends a WhatsApp message.',
      isCustom: true,
      output: whatsappMessageTriggerOutput,
    },
  ],
};
