import {
  IconAlertTriangle,
  IconDialpad,
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneEnd,
} from '@tabler/icons-react';
import { Alert, Button, ButtonProps, cn, Popover } from 'erxes-ui';
import { useAtomValue } from 'jotai';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCallDurationFromDate } from '@/integrations/call/hooks/useCallDuration';
import { usePlivo } from '@/integrations/plivo/components/PlivoProvider';
import { PlivoQualityIndicator } from '@/integrations/plivo/components/PlivoActions';
import {
  plivoCallStartedAtAtom,
  plivoStateAtom,
} from '@/integrations/plivo/states/plivoStates';
import {
  PlivoCallStatusEnum,
  PlivoErrorTypeEnum,
} from '@/integrations/plivo/types/plivoTypes';

const DTMF_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export const PlivoInCallActionButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    variant="ghost"
    className={cn(
      'flex-col h-auto text-accent-foreground hover:text-foreground font-medium [&>svg]:size-5 gap-1 rounded-lg justify-start text-wrap px-1 text-xs',
      className,
    )}
    {...props}
  />
));

PlivoInCallActionButton.displayName = 'PlivoInCallActionButton';

export const PlivoMuteButton = () => {
  const { t } = useTranslation('frontline');
  const { mute, unmute } = usePlivo();
  const { isMuted, callStatus } = useAtomValue(plivoStateAtom);

  return (
    <PlivoInCallActionButton
      disabled={callStatus !== PlivoCallStatusEnum.ACTIVE}
      onClick={isMuted ? unmute : mute}
      className={cn(isMuted && 'text-destructive hover:text-destructive')}
    >
      {isMuted ? <IconMicrophoneOff /> : <IconMicrophone />}
      {isMuted ? t('unmute') : t('mute')}
    </PlivoInCallActionButton>
  );
};

export const PlivoKeypadTrigger = () => {
  const { t } = useTranslation('frontline');
  const { sendDtmf } = usePlivo();
  const { callStatus } = useAtomValue(plivoStateAtom);
  const [sentTones, setSentTones] = useState('');

  const handleKey = (key: string) => {
    sendDtmf(key);
    setSentTones((prev) => (prev + key).slice(-20));
  };

  return (
    <Popover onOpenChange={(open) => !open && setSentTones('')}>
      <Popover.Trigger asChild>
        <PlivoInCallActionButton
          disabled={callStatus !== PlivoCallStatusEnum.ACTIVE}
        >
          <IconDialpad />
          {t('keypad')}
        </PlivoInCallActionButton>
      </Popover.Trigger>
      <Popover.Content className="w-56 p-2" align="center">
        <div className="h-7 mb-1 truncate text-center font-medium leading-7 tracking-widest tabular-nums">
          {sentTones}
        </div>
        {/* Same key size and gutter as the dialpad's own keypad, so the two
            keypads in this widget do not read as different controls. */}
        <div className="grid grid-cols-3 gap-1.5">
          {DTMF_KEYS.map((key) => (
            <Button
              key={key}
              variant="secondary"
              className="h-11 text-base font-semibold tabular-nums"
              onClick={() => handleKey(key)}
            >
              {key}
            </Button>
          ))}
        </div>
      </Popover.Content>
    </Popover>
  );
};

/**
 * Live call surface.
 *
 * There is no Hold control: Plivo's Browser SDK v2 has no hold/unhold method
 * (verified against the package's own `index.d.ts`), unlike JsSIP which the
 * Grandstream widget uses. A button that muted instead would leave the caller
 * connected to silence with no hold tone, so the control is omitted rather
 * than faked.
 */
export const PlivoInCall = () => {
  const { t } = useTranslation('frontline');
  const { stopCall } = usePlivo();
  const { callStatus, callCounterpart, callerName, plivoErrorType } =
    useAtomValue(plivoStateAtom);

  // Owned by the widget so the timer survives the panel being collapsed and
  // stays in step with the one drawn on the floating launcher.
  const startedAt = useAtomValue(plivoCallStartedAtAtom);
  const duration = useCallDurationFromDate(startedAt);

  const isEnding =
    callStatus === PlivoCallStatusEnum.FAILED ||
    callStatus === PlivoCallStatusEnum.ENDED;

  const statusLabels: Partial<Record<PlivoCallStatusEnum, string>> = {
    [PlivoCallStatusEnum.STARTING]: t('calling'),
    [PlivoCallStatusEnum.RINGING]: t('plivo-ringing'),
    [PlivoCallStatusEnum.ACTIVE]: t('in-call'),
    [PlivoCallStatusEnum.FAILED]: t('plivo-call-failed'),
    [PlivoCallStatusEnum.ENDED]: t('plivo-call-ended'),
  };

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div
          className={cn(
            'text-sm font-medium',
            callStatus === PlivoCallStatusEnum.FAILED
              ? 'text-destructive'
              : 'text-accent-foreground',
          )}
        >
          {statusLabels[callStatus]}
        </div>
        {/* Same hierarchy as the incoming screen, so the counterpart does not
            move or change size when a ringing call becomes an answered one. */}
        {callerName ? (
          <>
            <p className="text-xl font-semibold leading-tight text-foreground">
              {callerName}
            </p>
            <p className="text-sm text-accent-foreground">{callCounterpart}</p>
          </>
        ) : (
          <p className="text-xl font-semibold leading-tight text-foreground">
            {callCounterpart}
          </p>
        )}
        {callStatus === PlivoCallStatusEnum.ACTIVE && (
          <div className="flex items-center justify-center gap-2 text-sm text-accent-foreground">
            <span className="tabular-nums">{duration}</span>
            <PlivoQualityIndicator />
          </div>
        )}
      </div>

      {/* A denied microphone is terminal for the call, and the toast that
          reported it has long since gone by the time the agent looks here. */}
      {plivoErrorType === PlivoErrorTypeEnum.MEDIA_PERMISSION && (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <Alert.Description>{t('plivo-mic-denied')}</Alert.Description>
        </Alert>
      )}
      <div className="grid grid-cols-2 items-stretch gap-2">
        <PlivoMuteButton />
        <PlivoKeypadTrigger />
      </div>
      {/* Ending a call is destructive and time-critical, so it is a solid
          destructive button rather than a tinted secondary one. Once the call
          is already over the same slot just dismisses, and drops the red. */}
      <Button
        variant={isEnding ? 'secondary' : 'destructive'}
        // `size="lg"` is only h-8 in this library, under the 44px touch target
        // this control deserves, so the height is set outright.
        className="h-11 w-full text-sm"
        onClick={stopCall}
      >
        {isEnding ? (
          t('close')
        ) : (
          <>
            <IconPhoneEnd />
            {t('end-call')}
          </>
        )}
      </Button>
    </div>
  );
};
