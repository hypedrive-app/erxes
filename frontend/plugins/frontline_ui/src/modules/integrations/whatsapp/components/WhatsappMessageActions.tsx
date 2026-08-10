import { useCallback, useState } from 'react';
import { useSetAtom } from 'jotai';
import { Button, Popover, Tooltip, cn, toast } from 'erxes-ui';
import { IconArrowBackUp, IconMoodPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  WhatsappReplyTarget,
  whatsappReplyToState,
} from '../states/whatsappReplyToState';
import { useWhatsappReactToMessage } from '../hooks/useWhatsappReactToMessage';

const PREVIEW_LENGTH = 80;

/**
 * The six WhatsApp itself offers on a long-press, in its order.
 *
 * A full emoji picker is deliberately not used: WhatsApp's own reaction UI is
 * these six plus a search, agents reach for them for acknowledgement rather
 * than expression, and `ui-modules`' picker is internal to its automations
 * module — not something a plugin may import.
 */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const stripToText = (html?: string): string => {
  if (!html) {
    return '';
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent || '').trim();
};

/**
 * Mirrors DiscordMessageActions — same hover-revealed action bar, same
 * `opacity-0 group-hover:opacity-100` reveal — but scoped to just Reply.
 *
 * Unlike Discord's own API, the WhatsApp Cloud API documents no edit or
 * delete/unsend endpoint for a business's own sent messages, so there is
 * nothing else this bar could offer without it silently failing at Meta.
 */
export const WhatsappMessageActions = ({
  mid,
  content,
  ownReaction,
}: {
  mid: string;
  content?: string;
  /** This agent's own reaction, when they have left one. */
  ownReaction?: string;
}) => {
  const { t } = useTranslation('frontline');
  const setReplyTo = useSetAtom(whatsappReplyToState);
  const { reactToWhatsappMessage, loading } = useWhatsappReactToMessage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const text = stripToText(content);

  const handleReply = useCallback(() => {
    const preview = text.slice(0, PREVIEW_LENGTH) || 'message';
    setReplyTo({ mid, preview } as WhatsappReplyTarget);
  }, [setReplyTo, mid, text]);

  const handleReact = useCallback(
    (emoji: string) => {
      setPickerOpen(false);

      reactToWhatsappMessage({
        // Picking the emoji already on the message clears it, which is how
        // WhatsApp's own reaction row behaves — and the only way to remove one,
        // since Meta expresses removal as an empty emoji rather than a delete.
        variables: { messageId: mid, emoji: emoji === ownReaction ? '' : emoji },
        onError: (error) =>
          toast({ title: error.message, variant: 'destructive' }),
      });
    },
    [reactToWhatsappMessage, mid, ownReaction],
  );

  return (
    <Tooltip.Provider delayDuration={0}>
      <div className="flex h-8 shrink-0 items-center gap-px rounded-md border bg-background p-0.5 opacity-0 shadow-xs transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Tooltip>
          <Tooltip.Trigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Reply"
              onClick={handleReply}
              className={cn(
                'size-6 rounded-sm p-0 text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <IconArrowBackUp className="size-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content side="top" sideOffset={4}>
            Reply
          </Tooltip.Content>
        </Tooltip>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <Tooltip>
            <Tooltip.Trigger asChild>
              <Popover.Trigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={loading}
                  aria-label={t('whatsapp-react')}
                  className={cn(
                    'size-6 rounded-sm p-0 text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <IconMoodPlus className="size-4" />
                </Button>
              </Popover.Trigger>
            </Tooltip.Trigger>
            <Tooltip.Content side="top" sideOffset={4}>
              {t('whatsapp-react')}
            </Tooltip.Content>
          </Tooltip>

          <Popover.Content side="top" align="end" className="w-auto p-1">
            <div className="flex items-center gap-0.5">
              {QUICK_REACTIONS.map((emoji) => (
                <Button
                  key={emoji}
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={loading}
                  aria-label={emoji}
                  onClick={() => handleReact(emoji)}
                  className={cn(
                    'size-8 rounded-sm p-0 text-base leading-none hover:bg-accent',
                    // The one already left reads as pressed, so a second press
                    // is visibly the undo rather than a repeat.
                    emoji === ownReaction && 'bg-accent',
                  )}
                >
                  {emoji}
                </Button>
              ))}
            </div>
          </Popover.Content>
        </Popover>
      </div>
    </Tooltip.Provider>
  );
};
