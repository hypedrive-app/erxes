import { gql } from '@apollo/client';

export const GET_WHATSAPP_TEMPLATES = gql`
  query WhatsappTemplates($conversationId: String!) {
    whatsappTemplates(conversationId: $conversationId) {
      id
      name
      language
      status
      category
      components {
        type
        format
        text
      }
    }
  }
`;
