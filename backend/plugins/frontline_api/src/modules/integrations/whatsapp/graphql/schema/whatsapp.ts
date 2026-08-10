export const types = `
  type WhatsappTemplateButton {
    type: String
    text: String
    url: String
    phone_number: String
  }

  type WhatsappTemplateComponent {
    type: String
    format: String
    text: String
    buttons: [WhatsappTemplateButton]
  }

  type WhatsappTemplate {
    id: String
    name: String
    language: String
    status: String
    category: String
    components: [WhatsappTemplateComponent]
  }

  """A connected WhatsApp number a new conversation can be started from."""
  type WhatsappSenderIntegration {
    """Inbox integration id."""
    _id: String!
    """Inbox name of the integration."""
    name: String!
    """The connected number in display form, when Meta reported one."""
    displayPhoneNumber: String
  }
`;

export const queries = `
  whatsappTemplates(conversationId: String!): [WhatsappTemplate]
  whatsappSenderIntegrations: [WhatsappSenderIntegration]
  whatsappIntegrationTemplates(integrationId: String!): [WhatsappTemplate]
`;

export const mutations = `
  whatsappStartConversation(
    integrationId: String!
    customerId: String!
    templateName: String!
    languageCode: String!
    components: JSON
    content: String!
  ): String

  """
  Reacts to a message, or clears this agent's reaction when emoji is omitted —
  an empty emoji is Meta's own "remove" signal, not a missing value. messageId
  is the target's wamid. Returns the reaction's own wamid.
  """
  whatsappReactToMessage(messageId: String!, emoji: String): String
`;
