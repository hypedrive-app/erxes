import { cn } from 'erxes-ui';

/**
 * The reactions on a message, rendered beneath its bubble.
 *
 * This is where a reaction belongs: WhatsApp shows it attached to the message
 * it annotates, not as a line of its own in the thread. Storing them as
 * messages would put a bubble in the conversation for something the contact
 * never sent as one — a contact reacting to five messages would add five.
 *
 * Identical emoji from both sides collapse into one chip with a count, the way
 * WhatsApp itself groups them.
 */
export const WhatsappReactionChips = ({
  reactions,
  align,
}: {
  reactions: Array<{ emoji: string; isCustomer: boolean }>;
  /** Follows the bubble it belongs to, so it sits under the right edge. */
  align: 'left' | 'right';
}) => {
  if (!reactions.length) {
    return null;
  }

  const counts = reactions.reduce<Map<string, number>>((totals, reaction) => {
    totals.set(reaction.emoji, (totals.get(reaction.emoji) || 0) + 1);
    return totals;
  }, new Map());

  return (
    <div
      className={cn(
        '-mt-1 flex flex-wrap gap-1',
        align === 'right' && 'justify-end',
      )}
    >
      {[...counts.entries()].map(([emoji, count]) => (
        <span
          key={emoji}
          className="flex items-center gap-0.5 rounded-full border bg-background px-1.5 py-0.5 text-xs leading-none shadow-xs"
        >
          <span>{emoji}</span>
          {/* A lone reaction needs no "1" beside it — the emoji is the whole
              message. The count only earns its space once it disambiguates. */}
          {count > 1 && (
            <span className="text-muted-foreground">{count}</span>
          )}
        </span>
      ))}
    </div>
  );
};
