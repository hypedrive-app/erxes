import {
  IconPhoneFilled,
  IconPhoneIncoming,
  IconPhoneOff,
  IconPlayerStopFilled,
  IconX,
} from '@tabler/icons-react';
import { cn } from 'erxes-ui';
import { useAtomValue } from 'jotai';
import {
  plivoStateAtom,
  plivoWidgetOpenAtom,
} from '@/integrations/plivo/states/plivoStates';
import {
  PlivoCallDirectionEnum,
  PlivoCallStatusEnum,
  PlivoStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';

/**
 * Content of the floating launcher.
 *
 * Every state carries its OWN glyph, not just its own colour. The launcher used
 * to draw the same filled handset whether the softphone was registered or dead
 * and leave the red/green fill to carry the whole difference — unreadable to a
 * colour-blind agent, and invisible in a greyscale screenshot, which is how
 * most bug reports about this widget arrive. Shape is now the primary channel
 * and the fill only reinforces it.
 */
export const PlivoTriggerContent = ({ duration }: { duration: string }) => {
  const open = useAtomValue(plivoWidgetOpenAtom);
  const { callStatus, callDirection, plivoStatus } =
    useAtomValue(plivoStateAtom);

  const isRegistered = plivoStatus === PlivoStatusEnum.REGISTERED;

  // Matches the fill `PlivoWidgetDraggable` paints the launcher with, so the
  // glyph is contrasted against the colour it is actually sitting on.
  //
  // Near-black rather than white: the launcher's online fill is the light
  // `--success` green, against which white measures 2.30:1 — under WCAG 1.4.11's
  // 3:1 floor for a non-text control. Black on the same green measures 9.14:1.
  // The offline fill is a dark red, so that state keeps its white glyph.
  const glyphClass = isRegistered ? 'text-black/85' : 'text-white';

  // A call in progress outranks everything: the timer is the only thing an
  // agent looks at mid-call, and the stop glyph says what pressing it does.
  if (callStatus === PlivoCallStatusEnum.ACTIVE) {
    return (
      <div className="flex flex-col items-center justify-center">
        <IconPlayerStopFilled className="text-destructive size-4" />
        <div className="flex gap-1 font-medium leading-none text-xs">
          {duration}
        </div>
      </div>
    );
  }

  // An unanswered inbound call is the one state the agent must notice without
  // looking for it, so it gets a directional glyph of its own plus motion —
  // neither of which any other state uses. `motion-safe` keeps it honest for a
  // reduced-motion reader, who still has the distinct arrow to go on.
  if (
    callDirection === PlivoCallDirectionEnum.INCOMING &&
    callStatus === PlivoCallStatusEnum.STARTING
  ) {
    return (
      <IconPhoneIncoming
        className={cn(glyphClass, 'motion-safe:animate-pulse')}
      />
    );
  }

  // Open panel: the button's job is now to close it, so it says so.
  if (open) {
    return <IconX className={glyphClass} />;
  }

  // The resting pair. A struck-through handset for "cannot take calls" reads as
  // unavailable on its own; the filled handset reads as ready on its own.
  return isRegistered ? (
    <IconPhoneFilled className={glyphClass} />
  ) : (
    <IconPhoneOff className={glyphClass} />
  );
};
