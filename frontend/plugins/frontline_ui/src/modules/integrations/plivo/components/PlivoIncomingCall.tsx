import {
  IconPhone,
  IconPhoneEnd,
  IconPhoneIncoming,
} from '@tabler/icons-react';
import { Button, getPluginAssetsUrl, toast } from 'erxes-ui';
import { useAtomValue } from 'jotai';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlivo } from '@/integrations/plivo/components/PlivoProvider';
import { plivoStateAtom } from '@/integrations/plivo/states/plivoStates';
import {
  PlivoCallDirectionEnum,
  PlivoCallStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';

/**
 * Ringtone for an inbound call.
 *
 * Autoplay is blocked until the origin has seen a user gesture, so a rejected
 * `play()` is surfaced as a warning: the call still rings visually, but the
 * agent needs to know they will not hear the next one.
 */
export const PlivoIncomingCallAudio = () => {
  const { t } = useTranslation('frontline');
  const audioRef = useRef<HTMLAudioElement>(null);
  const { callStatus, callDirection } = useAtomValue(plivoStateAtom);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;

    const isRinging =
      callStatus === PlivoCallStatusEnum.STARTING &&
      callDirection === PlivoCallDirectionEnum.INCOMING;

    if (!isRinging) {
      element.pause();
      element.src = '';
      return;
    }

    element.src = getPluginAssetsUrl('frontline', 'sound/incoming.mp3');
    element.loop = true;
    element.play().catch(() => {
      element.src = '';
      toast({ title: t('ringtone-blocked'), variant: 'warning' });
    });
  }, [callStatus, callDirection, t]);

  return <audio ref={audioRef} loop />;
};

export const PlivoIncomingCall = () => {
  const { t } = useTranslation('frontline');
  const { answerCall, rejectCall } = usePlivo();
  const { callCounterpart, callerName } = useAtomValue(plivoStateAtom);

  return (
    // Matches the height of the tabbed surfaces so a call arriving does not
    // resize the floating panel, and `justify-between` keeps the two answer
    // controls at the foot of it rather than wherever the name above happens
    // to end.
    <div className="flex h-110 flex-col justify-between gap-5 p-5">
      <div className="flex flex-auto flex-col items-center justify-center gap-2 text-center">
        {/* A ringing handset says "incoming call" by shape, where a bare dot
            said only "something is happening". The ring animation is the
            attention-getter and is dropped for reduced-motion readers, leaving
            the icon and the wording to carry the meaning on their own. */}
        <span className="relative flex size-12 items-center justify-center">
          <span className="absolute inline-flex size-12 rounded-full bg-success/20 motion-safe:animate-ping" />
          <span className="relative inline-flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
            <IconPhoneIncoming className="size-6" />
          </span>
        </span>
        <p className="text-sm font-medium text-accent-foreground">
          {t('plivo-incoming-call')}
        </p>
        {/* The counterpart is the thing an agent reads before deciding to
            answer, so it is the largest element on the surface. */}
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
            {callCounterpart || t('plivo-unknown-caller')}
          </p>
        )}
      </div>
      {/* Answering and declining are the two most consequential and most
          hurried presses in the widget, and they are irreversible in opposite
          directions. So they are pulled apart by a full 3rem gutter — far more
          than the 0.75rem they used to share — and given 56px of height. The
          gap is the actual mis-hit protection: adjacent 44px buttons are easy
          to catch the wrong edge of when the panel appears under a moving
          cursor.
          They are also told apart WITHOUT colour: the icons point opposite
          ways, Answer is the only filled button on the surface, and each
          carries its own word. */}
      <div className="grid grid-cols-2 gap-12">
        <Button
          variant="outline"
          className="h-14 text-sm font-semibold text-destructive border-destructive/30 bg-destructive/5 hover:bg-destructive/15 hover:text-destructive"
          onClick={rejectCall}
        >
          <IconPhoneEnd />
          {t('decline')}
        </Button>
        <Button
          className="h-14 text-sm font-semibold bg-success text-white hover:bg-success/90"
          onClick={answerCall}
        >
          <IconPhone />
          {t('answer')}
        </Button>
      </div>
    </div>
  );
};
