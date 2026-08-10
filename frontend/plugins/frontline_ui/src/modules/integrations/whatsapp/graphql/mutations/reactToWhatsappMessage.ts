import { gql } from '@apollo/client';

export const REACT_TO_WHATSAPP_MESSAGE = gql`
  mutation WhatsappReactToMessage($messageId: String!, $emoji: String) {
    whatsappReactToMessage(messageId: $messageId, emoji: $emoji)
  }
`;
