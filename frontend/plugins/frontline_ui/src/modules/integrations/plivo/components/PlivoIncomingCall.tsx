import { IconPhone, IconPhoneEnd } from '@tabler/icons-react';
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
    <div className="flex flex-col gap-5 p-5">
      <div className="flex flex-col items-center gap-2 text-center">
        {/* The pulse marks a live, waiting call at a glance; the wording below
            carries the same meaning for anyone who cannot see it. */}
        <span className="relative flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-success" />
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
            <p className="text-sm text-accent-foreground">{callCounterpart}</p>
          </>
        ) : (
          <p className="text-xl font-semibold leading-tight text-foreground">
            {callCounterpart || t('plivo-unknown-caller')}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          // Answer/decline are the two hardest-pressed controls in the whole
          // widget, so both get a full 44px target.
          className="h-11 text-sm text-destructive bg-destructive/10 hover:bg-destructive/15"
          onClick={rejectCall}
        >
          <IconPhoneEnd />
          {t('decline')}
        </Button>
        <Button
          variant="secondary"
          className="h-11 text-sm text-success bg-success/10 hover:bg-success/15"
          onClick={answerCall}
        >
          <IconPhone />
          {t('answer')}
        </Button>
      </div>
    </div>
  );
};
