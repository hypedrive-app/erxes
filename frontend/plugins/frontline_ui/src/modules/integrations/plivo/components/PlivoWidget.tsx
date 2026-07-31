import { Button } from 'erxes-ui';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Popover as PopoverPrimitive } from 'radix-ui';
import {
  CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useCallDurationFromDate } from '@/integrations/call/hooks/useCallDuration';
import { PlivoActions } from '@/integrations/plivo/components/PlivoActions';
import { PlivoInCall } from '@/integrations/plivo/components/PlivoInCall';
import { PlivoNumberPicker } from '@/integrations/plivo/components/PlivoNumberPicker';
import {
  PlivoIncomingCall,
  PlivoIncomingCallAudio,
} from '@/integrations/plivo/components/PlivoIncomingCall';
import {
  PlivoNumberInput,
  useCanPlaceCall,
} from '@/integrations/plivo/components/PlivoNumberInput';
import { usePlivo } from '@/integrations/plivo/components/PlivoProvider';
import { PlivoTriggerContent } from '@/integrations/plivo/components/PlivoTriggerContent';
import { PlivoWidgetDraggableRoot } from '@/integrations/plivo/components/PlivoWidgetDraggable';
import { usePlivoSoftphoneIntegrations } from '@/integrations/plivo/hooks/usePlivoSoftphoneIntegrations';
import {
  plivoCallStartedAtAtom,
  plivoNumberAtom,
  plivoStateAtom,
  plivoWidgetOpenAtom,
} from '@/integrations/plivo/states/plivoStates';
import {
  PlivoCallDirectionEnum,
  PlivoCallStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';

export const PlivoDialpad = () => {
  const { t } = useTranslation('frontline');
  const { startCall, phoneNumber } = usePlivo();
  const number = useAtomValue(plivoNumberAtom);
  const canCall = useCanPlaceCall();
  const { integrations, integrationId, selectIntegration } =
    usePlivoSoftphoneIntegrations();

  return (
    <div className="px-3 pt-3">
      <PlivoActions />
      {/* Only worth showing when there is actually a choice; with one number
          the caller id line below already says which one is in use. */}
      {integrations.length > 1 && (
        <div className="py-3">
          <PlivoNumberPicker
            integrations={integrations}
            value={integrationId}
            onValueChange={selectIntegration}
          />
        </div>
      )}
      <PlivoNumberInput />
      {phoneNumber && (
        <div className="text-xs text-accent-foreground text-center pb-2">
          {t('plivo-calling-from')}: {phoneNumber}
        </div>
      )}
      <Button
        className="my-3 w-full"
        disabled={!number.length || !canCall}
        onClick={() => startCall(number)}
      >
        {t('call')}
      </Button>
    </div>
  );
};

/** Picks the surface that matches the current call state. */
export const PlivoWidgetContent = () => {
  const { callStatus, callDirection } = useAtomValue(plivoStateAtom);

  if (
    callDirection === PlivoCallDirectionEnum.INCOMING &&
    callStatus === PlivoCallStatusEnum.STARTING
  ) {
    return <PlivoIncomingCall />;
  }

  if (callStatus === PlivoCallStatusEnum.IDLE) {
    return <PlivoDialpad />;
  }

  return <PlivoInCall />;
};

/**
 * Floating softphone, built the same way as the Grandstream call widget: a
 * draggable launcher whose colour reflects registration, with the panel in a
 * portalled popover. It keeps its own position and open-state atoms so an
 * account running both providers gets two independent buttons.
 */
export const PlivoWidget = () => {
  const { t } = useTranslation('frontline');
  const popoverContentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>();
  const open = useAtomValue(plivoWidgetOpenAtom);
  const setOpen = useSetAtom(plivoWidgetOpenAtom);
  const { callStatus, callDirection } = useAtomValue(plivoStateAtom);

  const [startedAt, setStartedAt] = useAtom(plivoCallStartedAtAtom);
  const duration = useCallDurationFromDate(startedAt);

  useLayoutEffect(() => {
    if (popoverContentRef.current) {
      setContentHeight(popoverContentRef.current.offsetHeight);
    }
  }, []);

  // An inbound call must present itself; returning to idle collapses the panel
  // again so the widget does not sit open over the page after a call.
  useEffect(() => {
    if (
      callDirection === PlivoCallDirectionEnum.INCOMING &&
      callStatus === PlivoCallStatusEnum.STARTING
    ) {
      setOpen(true);
    }

    if (callStatus === PlivoCallStatusEnum.IDLE) {
      setOpen(false);
    }
  }, [callDirection, callStatus, setOpen]);

  // The timer starts when the call is answered, not when it is dialled.
  useEffect(() => {
    setStartedAt(callStatus === PlivoCallStatusEnum.ACTIVE ? new Date() : null);
  }, [callStatus, setStartedAt]);

  return (
    <>
      <PlivoIncomingCallAudio />
      <PopoverPrimitive.Root open={open}>
        <PlivoWidgetDraggableRoot
          label={t('plivo-softphone')}
          trigger={<PlivoTriggerContent duration={duration} />}
        >
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              sideOffset={12}
              onOpenAutoFocus={(e) => e.preventDefault()}
              ref={popoverContentRef}
              style={
                {
                  '--radix-popper-content-height': contentHeight,
                } as CSSProperties
              }
              className="z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 rounded-lg bg-background text-foreground shadow-lg w-96"
            >
              <PlivoWidgetContent />
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PlivoWidgetDraggableRoot>
      </PopoverPrimitive.Root>
    </>
  );
};
