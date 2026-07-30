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
`;

export const queries = `
  whatsappTemplates(conversationId: String!): [WhatsappTemplate]
`;

export const mutations = ``;
