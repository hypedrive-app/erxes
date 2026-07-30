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
import { PlivoCallStatusEnum } from '@/integrations/plivo/types/plivoTypes';

/**
 * Content of the floating launcher, mirroring the Grandstream widget so both
 * softphones read identically: a live timer while a call is up, otherwise a
 * handset that becomes a close icon when the panel is open.
 */
export const PlivoTriggerContent = ({ duration }: { duration: string }) => {
  const open = useAtomValue(plivoWidgetOpenAtom);
  const { callStatus } = useAtomValue(plivoStateAtom);

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

  return open ? (
    <IconX className="text-white" />
  ) : (
    <IconPhoneFilled className="text-white" />
  );
};
