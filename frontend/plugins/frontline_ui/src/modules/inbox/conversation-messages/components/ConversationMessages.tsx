import { useEffect } from 'react';
import { MessageItem } from './MessageItem';
import { IMessage } from '@/inbox/types/Conversation';
import { useConversationMessages } from '@/inbox/conversation-messages/hooks/useConversationMessages';
import { useConversationTypingStatus } from '@/inbox/conversation-messages/hooks/useConversationTypingStatus';
import { TypingIndicator } from '@/inbox/conversation-messages/components/TypingIndicator';
import { ConversationMessageContext } from '@/inbox/conversations/context/ConversationMessageContext';
import { InboxMessagesContainer } from '@/inbox/components/InboxMessagesContainer';

export const ConversationMessages = ({
  conversationId,
}: {
  conversationId: string;
}) => {
  const { messages, loading, handleFetchMore, totalCount } =
    useConversationMessages({
      variables: {
        conversationId,
        limit: 10,
        skip: 0,
      },
      fetchPolicy: 'cache-and-network',
    });

  const { typingNames, clearTypist } = useConversationTypingStatus(
    conversationId,
  );

  const lastMessage = messages?.[messages.length - 1];
  useEffect(() => {
    clearTypist(lastMessage?.customerId);
  }, [lastMessage?._id, lastMessage?.customerId, clearTypist]);

  const isGroupConversation =
    new Set((messages || []).map((m: IMessage) => m.customerId).filter(Boolean))
      .size > 1;

  return (
    <InboxMessagesContainer
      /* Keyed so switching conversations remounts it: the container tracks
         whether the agent is scrolled to the bottom, and that is a fact about
         one thread, not about the pane. Without this, scrolling up in one
         conversation and opening another carried the "not at bottom" state
         over — the new thread would open without scrolling to its latest
         message, and could show a stale "New messages" pill. */
      key={conversationId}
      fetchMore={handleFetchMore}
      messagesLength={messages?.length || 0}
      totalCount={totalCount}
      loading={loading}
    >
      {messages?.map((message: IMessage, index: number) => (
        <ConversationMessageContext.Provider
          value={{
            ...message,
            conversationId: message.conversationId || conversationId,
            previousMessage: messages[index - 1],
            nextMessage: messages[index + 1],
            isGroupConversation,
          }}
          key={message._id}
        >
          <MessageItem />
        </ConversationMessageContext.Provider>
      ))}
      <TypingIndicator names={typingNames} />
    </InboxMessagesContainer>
  );
};
