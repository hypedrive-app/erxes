import { ScrollArea } from 'erxes-ui';
import { IconMessage2 } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import { useTranslation } from 'react-i18next';
import { InboxMessagesSkeleton } from './InboxMessagesSkeleton';

/**
 * A conversation with no renderable messages yet — a brand-new lead thread,
 * or one whose only messages were filtered out (MessageItem's own
 * hasRenderableContent check). Matches the dashed-icon-tile pattern already
 * established for "nothing here" elsewhere in the inbox (NoConversationSelected,
 * Conversations.tsx's own empty list state) rather than a bare blank pane.
 */
const NoMessages = () => {
  const { t } = useTranslation('frontline');
  return (
    <div className="flex w-full flex-col items-center justify-center py-16">
      <div className="flex size-28 items-center justify-center rounded-2xl border border-dashed bg-sidebar">
        <IconMessage2 size={64} className="text-scroll" stroke={1} />
      </div>
      <div className="mt-5 font-medium text-muted-foreground">
        {t('no-messages-yet')}
      </div>
    </div>
  );
};

export const InboxMessagesContainer = ({
  fetchMore,
  messagesLength,
  totalCount,
  loading,
  children,
}: React.PropsWithChildren<{
  fetchMore: () => void;
  messagesLength: number;
  totalCount: number;
  loading: boolean;
}>) => {
  const viewportRef = useRef<HTMLDivElement>(null);

  const [fetchMoreRef] = useInView({
    threshold: 0,
    onChange(inView) {
      if (inView && viewportRef.current) {
        distanceFromBottomRef.current =
          viewportRef.current.scrollHeight - viewportRef.current.scrollTop;
        fetchMore();
      }
    },
  });
  const distanceFromBottomRef = useRef(0);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (viewportRef.current) {
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      }
    });
  };
  useEffect(() => {
    if (viewportRef.current) {
      if (distanceFromBottomRef.current) {
        viewportRef.current.scrollTop =
          viewportRef.current.scrollHeight - distanceFromBottomRef.current;
        distanceFromBottomRef.current = 0;
      } else if (messagesLength > 0) {
        scrollToBottom();
      }
    }
  }, [messagesLength, fetchMore]);

  return (
    <ScrollArea.Root className="h-full">
      <ScrollArea.Viewport ref={viewportRef}>
        {!!messagesLength && totalCount > messagesLength && (
          <p ref={fetchMoreRef} />
        )}
        {/* NoMessages sits ALONGSIDE children rather than replacing them —
            children also carries the typing indicator (ConversationMessages.tsx),
            which can legitimately fire on a thread with zero messages so far
            (someone started typing before sending anything), and that must
            stay visible rather than being hidden behind an empty-state
            early return. */}
        {!loading && !messagesLength && <NoMessages />}
        <div className="flex flex-col max-w-[648px] mx-auto p-6">
          {children}
        </div>
        <InboxMessagesSkeleton isFetched={!loading} />
      </ScrollArea.Viewport>
      <ScrollArea.Bar orientation="vertical" />
      <ScrollArea.Bar orientation="horizontal" />
    </ScrollArea.Root>
  );
};
