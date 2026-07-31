import {
  IconPhoneFilled,
  IconPlayerStopFilled,
  IconX,
} from '@tabler/icons-react';
import { useAtomValue } from 'jotai';
import {
  plivoStateAtom,
  plivoWidgetOpenAtom,
} from '@/integrations/plivo/states/plivoStates';
import {
  PlivoCallStatusEnum,
  PlivoStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';

/**
 * Content of the floating launcher, mirroring the Grandstream widget so both
 * softphones read identically: a live timer while a call is up, otherwise a
 * handset that becomes a close icon when the panel is open.
 */
export const PlivoTriggerContent = ({ duration }: { duration: string }) => {
  const open = useAtomValue(plivoWidgetOpenAtom);
  const { callStatus, plivoStatus } = useAtomValue(plivoStateAtom);

  // Matches the fill `PlivoWidgetDraggableRoot` paints the launcher with, so
  // the glyph is contrasted against the colour it is actually sitting on.
  const glyphClass =
    plivoStatus === PlivoStatusEnum.REGISTERED ? 'text-black/85' : 'text-white';

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

  // Near-black rather than white: the launcher's online fill is the light
  // `--success` green, against which white measures 2.30:1 — under WCAG 1.4.11's
  // 3:1 floor for a non-text control. Black on the same green measures 9.14:1.
  // The offline fill is a dark red, so that state keeps its white glyph.
  return open ? (
    <IconX className={glyphClass} />
  ) : (
    <IconPhoneFilled className={glyphClass} />
  );
};
