import { IconPhoneFilled } from '@tabler/icons-react';
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
import { PlivoTabs } from '@/integrations/plivo/components/PlivoTabs';
import { PlivoTriggerContent } from '@/integrations/plivo/components/PlivoTriggerContent';
import { PlivoWidgetDraggableRoot } from '@/integrations/plivo/components/PlivoWidgetDraggable';
import { usePlivoDialer } from '@/integrations/plivo/hooks/usePlivoDialer';
import { usePlivoSoftphoneIntegrations } from '@/integrations/plivo/hooks/usePlivoSoftphoneIntegrations';
import { toDialableNumber } from '@/integrations/plivo/utils/plivoPhone';
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
  const { phoneNumber } = usePlivo();
  const number = useAtomValue(plivoNumberAtom);
  const canCall = useCanPlaceCall();
  const { dial, isReady } = usePlivoDialer();
  const { integrations, integrationId, selectIntegration } =
    usePlivoSoftphoneIntegrations();

  // Typed digits are dialled through the same normaliser as every other call
  // surface, so a number entered without a country code still reaches E.164
  // instead of being handed to the SDK as typed.
  const isDialable = !!toDialableNumber(number);
  const isDisabled = !isDialable || !canCall;

  // A greyed-out Call button with no explanation is the worst version of this
  // control: the agent cannot tell a bad number from a dead connection. Each
  // reason is named, in priority order, and shown as text beside the button.
  const disabledReason = (() => {
    if (!isReady) return t('plivo-cannot-call-offline');
    if (!canCall) return t('plivo-cannot-call-busy');
    if (!number.length) return t('plivo-cannot-call-empty');
    if (!isDialable) return t('plivo-cannot-call-invalid');
    return null;
  })();

  return (
    <div className="flex flex-col gap-3 p-3">
      <PlivoActions />
      {/* Only worth showing when there is actually a choice; with one number
          the caller id line below already says which one is in use. */}
      {integrations.length > 1 && (
        <PlivoNumberPicker
          integrations={integrations}
          value={integrationId}
          onValueChange={selectIntegration}
        />
      )}
      <PlivoNumberInput />
      <div className="flex flex-col gap-1.5">
        <Button
          // `size="lg"` is only h-8 here; the primary action of the whole panel
          // is sized to match the keypad keys it sits under.
          className="h-11 w-full text-sm"
          disabled={isDisabled}
          onClick={() => dial(number)}
        >
          <IconPhoneFilled />
          {t('call')}
        </Button>
        {/* The reason is text, not just a colour change, so it survives both a
            colour-blind reader and a screen reader. */}
        {disabledReason && (
          <p
            role="status"
            className="text-center text-xs text-accent-foreground"
          >
            {disabledReason}
          </p>
        )}
        {phoneNumber && !disabledReason && (
          <p className="text-center text-xs text-accent-foreground">
            {t('plivo-calling-from')}: {phoneNumber}
          </p>
        )}
      </div>
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

  // The address book is only offered between calls: mid-call the panel belongs
  // to the live call, and starting a second one from here is not possible.
  if (callStatus === PlivoCallStatusEnum.IDLE) {
    return <PlivoTabs keypad={<PlivoDialpad />} />;
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
              collisionPadding={8}
              onOpenAutoFocus={(e) => e.preventDefault()}
              ref={popoverContentRef}
              style={
                {
                  '--radix-popper-content-height': contentHeight,
                } as CSSProperties
              }
              // A fixed w-96 is wider than a 375px phone, so the panel hung off
              // the screen and the dialpad's right column was unreachable. It
              // keeps its 24rem on anything roomier than that.
              className="z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 rounded-lg bg-background text-foreground shadow-lg w-[min(24rem,calc(100vw-1rem))] max-h-[calc(100dvh-6rem)] overflow-y-auto"
            >
              <PlivoWidgetContent />
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PlivoWidgetDraggableRoot>
      </PopoverPrimitive.Root>
    </>
  );
};
