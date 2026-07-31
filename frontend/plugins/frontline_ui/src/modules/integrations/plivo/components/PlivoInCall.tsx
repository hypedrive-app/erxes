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
  ButtonProps & { active?: boolean }
>(({ className, active, ...props }, ref) => (
  <Button
    ref={ref}
    variant="ghost"
    // `h-auto` let these collapse to whatever the label needed; they are now a
    // fixed 64px so the mid-call controls are a real target and the row keeps
    // one height whether a label wraps or not.
    // An engaged control is marked by a filled background AND a ring, not by
    // colour alone, so "mute is on" is readable in greyscale.
    aria-pressed={active}
    className={cn(
      'flex-col h-16 font-medium [&>svg]:size-5 gap-1 rounded-lg justify-center text-wrap px-1 text-xs',
      active
        ? 'bg-accent text-foreground font-semibold ring-1 ring-inset ring-border hover:bg-accent'
        : 'text-accent-foreground hover:text-foreground',
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
      active={isMuted}
      // The slashed microphone, the pressed styling and the word all change
      // together — muting yourself and not noticing is the classic call-UI
      // failure, so it is signalled three ways.
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
        {/* Height is reserved whether or not a tone has been sent, so the keys
            do not shift down the moment the first digit is pressed. */}
        <div
          role="status"
          aria-label={t('plivo-tones-sent')}
          className="h-7 mb-1 truncate text-center font-medium leading-7 tracking-widest tabular-nums"
        >
          {sentTones || (
            <span className="text-xs font-normal tracking-normal text-accent-foreground">
              {t('plivo-keypad-hint')}
            </span>
          )}
        </div>
        {/* Same key size and gutter as the dialpad's own keypad, so the two
            keypads in this widget do not read as different controls. */}
        <div className="grid grid-cols-3 gap-1.5">
          {DTMF_KEYS.map((key) => (
            <Button
              key={key}
              variant="secondary"
              className="h-11 text-base font-semibold tabular-nums transition-transform duration-75 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
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
  const { callStatus, callCounterpart, callerName, plivoErrorType, isMuted } =
    useAtomValue(plivoStateAtom);

  // Owned by the widget so the timer survives the panel being collapsed and
  // stays in step with the one drawn on the floating launcher.
  const startedAt = useAtomValue(plivoCallStartedAtAtom);
  const duration = useCallDurationFromDate(startedAt);

  const isEnding =
    callStatus === PlivoCallStatusEnum.FAILED ||
    callStatus === PlivoCallStatusEnum.ENDED;

  const isConnecting =
    callStatus === PlivoCallStatusEnum.STARTING ||
    callStatus === PlivoCallStatusEnum.RINGING;

  const statusLabels: Partial<Record<PlivoCallStatusEnum, string>> = {
    [PlivoCallStatusEnum.STARTING]: t('calling'),
    [PlivoCallStatusEnum.RINGING]: t('plivo-ringing'),
    [PlivoCallStatusEnum.ACTIVE]: t('in-call'),
    [PlivoCallStatusEnum.FAILED]: t('plivo-call-failed'),
    [PlivoCallStatusEnum.ENDED]: t('plivo-call-ended'),
  };

  return (
    // Same height as every other surface in the panel, so answering, muting or
    // hanging up never resizes the widget mid-call.
    <div className="flex h-110 flex-col gap-5 p-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <div
          className={cn(
            'flex items-center gap-1.5 text-sm font-medium',
            callStatus === PlivoCallStatusEnum.FAILED
              ? 'text-destructive'
              : 'text-accent-foreground',
          )}
        >
          {/* A pulsing dot marks a call that is still being set up, so
              "Calling…" and "In call" differ by more than their wording. */}
          {isConnecting && (
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-current motion-safe:animate-pulse"
            />
          )}
          {statusLabels[callStatus]}
        </div>
        {/* Same hierarchy as the incoming screen, so the counterpart does not
            move or change size when a ringing call becomes an answered one. */}
        {callerName ? (
          <>
            <p className="text-xl font-semibold leading-tight text-foreground">
              {callerName}
            </p>
            <p className="text-sm tabular-nums text-accent-foreground">
              {callCounterpart}
            </p>
          </>
        ) : (
          <p className="text-xl font-semibold leading-tight tabular-nums text-foreground">
            {callCounterpart}
          </p>
        )}
        {/* The timer's row is always present, so answering a call does not
            shove every control below it down by a line. Mid-call the elapsed
            time is the number an agent glances at most, so it is given real
            size rather than being tucked in with the status text. */}
        <div className="flex h-7 items-center justify-center gap-2">
          {callStatus === PlivoCallStatusEnum.ACTIVE && (
            <>
              <span
                className="text-lg font-semibold tabular-nums text-foreground"
                role="timer"
                aria-label={t('plivo-call-duration')}
              >
                {duration}
              </span>
              <PlivoQualityIndicator />
            </>
          )}
        </div>
      </div>

      {/* A denied microphone is terminal for the call, and the toast that
          reported it has long since gone by the time the agent looks here. */}
      {plivoErrorType === PlivoErrorTypeEnum.MEDIA_PERMISSION && (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <Alert.Description>{t('plivo-mic-denied')}</Alert.Description>
        </Alert>
      )}
      {/* Mute is the one state whose consequence is silent: the agent talks and
          nobody hears them. It gets a standing line of its own, not just a
          styled button, and it announces itself. */}
      {isMuted && callStatus === PlivoCallStatusEnum.ACTIVE && (
        <p
          role="status"
          className="flex items-center justify-center gap-1.5 rounded-md bg-destructive/10 py-1.5 text-xs font-medium text-destructive"
        >
          <IconMicrophoneOff className="size-4" />
          {t('plivo-you-are-muted')}
        </p>
      )}
      <div className="grid grid-cols-2 items-stretch gap-2">
        <PlivoMuteButton />
        <PlivoKeypadTrigger />
      </div>
      {/* Ending a call is destructive and time-critical, so it is a solid
          destructive button rather than a tinted secondary one. Once the call
          is already over the same slot just dismisses, and drops the red.
          `mt-auto` pins it to the foot of the panel so it is in the same place
          on every call state rather than floating up under a short one. */}
      <Button
        variant={isEnding ? 'secondary' : 'destructive'}
        // `size="lg"` is only h-8 in this library, under the 44px touch target
        // this control deserves, so the height is set outright.
        className="mt-auto h-12 w-full text-sm font-semibold"
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
