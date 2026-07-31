import { IconMailbox, IconPlayerPlay } from '@tabler/icons-react';
import { cn } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { getPlivoRecordingUrl } from '@/integrations/plivo/utils/plivoHistoryUtils';

/**
 * Plays the audio attached to a call.
 *
 * The `isVoicemail` prop changes far more than a label. A voicemail is an
 * unhandled contact — someone tried to reach this number, failed, and left
 * something that still needs acting on — whereas a recording is just a record
 * of a conversation that already happened. So a voicemail is framed as a
 * warning with its own heading and "left at" time, while a recording is quiet
 * secondary chrome. Rendering them identically would let a waiting voicemail
 * disappear into a list of handled calls, which is the whole failure this
 * component exists to prevent.
 */
export const PlivoRecordingPlayer = ({
  recordUrl,
  isVoicemail,
  className,
}: {
  recordUrl: string;
  isVoicemail?: boolean | null;
  className?: string;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isVoicemail
          ? 'border-warning/30 bg-warning/5'
          : 'border-border bg-accent/40',
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        {isVoicemail ? (
          <IconMailbox className="size-4 shrink-0 text-warning" />
        ) : (
          <IconPlayerPlay className="size-4 shrink-0 text-accent-foreground" />
        )}
        <span className={cn(isVoicemail && 'text-warning')}>
          {isVoicemail ? t('plivo-voicemail') : t('plivo-call-recording')}
        </span>
      </div>
      <audio controls preload="none" className="w-full">
        <source src={getPlivoRecordingUrl(recordUrl)} />
        {t('plivo-audio-unsupported')}
      </audio>
    </div>
  );
};
