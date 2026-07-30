import { IconExclamationCircle } from '@tabler/icons-react';
import { differenceInHours } from 'date-fns';
import { Alert } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useConversationContext } from '@/inbox/conversations/hooks/useConversationContext';
import { useConversationMessages } from '@/inbox/conversation-messages/hooks/useConversationMessages';
import { IMessage } from '@/inbox/types/Conversation';
import { WHATSAPP_MESSAGE_WINDOW_HOURS } from '../constants/whatsappSchema';

/**
 * WhatsApp only accepts free-form replies within 24 hours of the customer's
 * last inbound message. Outside that window Meta rejects everything but a
 * pre-approved template, so the composer is replaced rather than left to fail
 * on send. Template sending is not implemented yet, hence no picker here.
 */
export const WhatsappMessageInputWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { t } = useTranslation('frontline');
  const { _id: conversationId } = useConversationContext();

  const { messages, loading } = useConversationMessages({
    variables: {
      conversationId,
      limit: 10,
      skip: 0,
    },
    fetchPolicy: 'cache-first',
    skip: !conversationId,
  });

  if (loading) {
    return (
      <div className="flex-auto h-full px-6">
        <div className="rounded-lg bg-sidebar h-full mx-auto max-w-2xl" />
      </div>
    );
  }

  // Only inbound customer messages reopen the window; our own replies and
  // internal notes do not.
  const lastCustomerMessage = [...(messages || [])]
    .reverse()
    .find((message: IMessage) => !!message.customerId && !message.internal);

  if (!lastCustomerMessage) {
    return children;
  }

  const isOutsideWindow =
    differenceInHours(new Date(), new Date(lastCustomerMessage.createdAt)) >=
    WHATSAPP_MESSAGE_WINDOW_HOURS;

  if (!isOutsideWindow) {
    return children;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Alert>
        <IconExclamationCircle />
        <Alert.Title>{t('whatsapp-24h-window-title')}</Alert.Title>
        <Alert.Description>
          {t('whatsapp-24h-window-description')}
        </Alert.Description>
      </Alert>
    </div>
  );
};
