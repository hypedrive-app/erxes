import { useMutation } from '@apollo/client';
import { REACT_TO_WHATSAPP_MESSAGE } from '../graphql/mutations/reactToWhatsappMessage';

/**
 * Leaves or clears an emoji reaction on a WhatsApp message.
 *
 * `ConversationMessages` is refetched because a reaction is not a message: it
 * lands on the reacted-to row's `whatsappReactions`, so nothing arrives on the
 * message subscription to update the thread the way a new bubble would.
 */
export const useWhatsappReactToMessage = () => {
  const [reactToWhatsappMessage, { loading }] = useMutation<{
    whatsappReactToMessage: string;
  }>(REACT_TO_WHATSAPP_MESSAGE, {
    refetchQueries: ['ConversationMessages'],
  });

  return {
    reactToWhatsappMessage,
    loading,
  };
};
