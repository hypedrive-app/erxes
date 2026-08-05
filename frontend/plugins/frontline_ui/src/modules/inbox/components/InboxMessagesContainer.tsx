import { Button, ScrollArea, cn } from 'erxes-ui';
import { IconArrowDown, IconMessage2 } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useTranslation } from 'react-i18next';
import { InboxMessagesSkeleton } from './InboxMessagesSkeleton';

/**
 * How far from the bottom the viewport may sit and still count as "at the
 * bottom". Anything inside this margin is treated as the agent still watching
 * the live end of the thread, so a new message follows automatically; past it
 * they are reading history and must not be yanked away.
 */
const AT_BOTTOM_THRESHOLD_PX = 80;

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
  const { t } = useTranslation('frontline');
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
  const isAtBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (viewportRef.current) {
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      }
    });
  }, []);

  /**
   * Tracked on every scroll rather than read inside the new-message effect,
   * because by the time that effect runs the DOM already contains the new
   * message — scrollHeight has grown, so the distance measured then would
   * report the agent as further from the bottom than they were when the
   * message arrived.
   */
  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const atBottom = distanceFromBottom <= AT_BOTTOM_THRESHOLD_PX;

    isAtBottomRef.current = atBottom;

    if (atBottom) {
      setShowJumpToLatest(false);
    }
  }, []);

  const jumpToLatest = useCallback(() => {
    isAtBottomRef.current = true;
    setShowJumpToLatest(false);
    scrollToBottom();
  }, [scrollToBottom]);

  useEffect(() => {
    if (viewportRef.current) {
      if (distanceFromBottomRef.current) {
        // Older page just prepended: hold the agent's place rather than
        // moving them, and leave the at-bottom flag alone — paginating
        // upwards is not the same as choosing to leave the live end.
        viewportRef.current.scrollTop =
          viewportRef.current.scrollHeight - distanceFromBottomRef.current;
        distanceFromBottomRef.current = 0;
      } else if (messagesLength > 0) {
        // A new message arrived. Following it is only correct when the agent
        // was already watching the bottom; if they had scrolled up to read
        // history, this used to yank them away mid-sentence with no way back
        // except scrolling by hand. Offer the jump instead — the pattern
        // Slack, Discord, Telegram and WhatsApp all use.
        if (isAtBottomRef.current) {
          scrollToBottom();
        } else {
          setShowJumpToLatest(true);
        }
      }
    }
  }, [messagesLength, fetchMore, scrollToBottom]);

  return (
    <ScrollArea.Root className="relative h-full">
      <ScrollArea.Viewport ref={viewportRef} onScroll={handleScroll}>
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
      <Button
        size="sm"
        variant="secondary"
        onClick={jumpToLatest}
        aria-hidden={!showJumpToLatest}
        tabIndex={showJumpToLatest ? 0 : -1}
        className={cn(
          'absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-md transition-opacity',
          showJumpToLatest ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <IconArrowDown />
        {t('new-messages')}
      </Button>
      <ScrollArea.Bar orientation="vertical" />
      <ScrollArea.Bar orientation="horizontal" />
    </ScrollArea.Root>
  );
};
