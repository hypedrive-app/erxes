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
    <>
      <div className="mt-2 px-3 pt-3 mb-1 space-y-2 text-center">
        <div className="text-accent-foreground text-sm">
          {t('plivo-incoming-call')}
        </div>
        {callerName && (
          <div className="font-semibold text-foreground">{callerName}</div>
        )}
        <div className="font-medium text-foreground">{callCounterpart}</div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          className="text-destructive bg-destructive/10 hover:bg-destructive/15"
          onClick={rejectCall}
        >
          <IconPhoneEnd />
          {t('decline')}
        </Button>
        <Button
          variant="secondary"
          className="text-success bg-success/10 hover:bg-success/15"
          onClick={answerCall}
        >
          <IconPhone />
          {t('answer')}
        </Button>
      </div>
    </>
  );
};
