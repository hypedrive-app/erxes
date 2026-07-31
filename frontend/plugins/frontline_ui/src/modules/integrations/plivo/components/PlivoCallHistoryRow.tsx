import {
  IconArrowUpRight,
  IconChevronDown,
  IconMailbox,
  IconPhoneIncoming,
  IconPhoneOutgoing,
  IconPhoneX,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { Badge, Button, Collapsible, Tooltip, cn } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PlivoRecordingPlayer } from '@/integrations/plivo/components/PlivoRecordingPlayer';
import { usePlivoDialer } from '@/integrations/plivo/hooks/usePlivoDialer';
import { IPlivoCallHistory } from '@/integrations/plivo/types/plivoTypes';
import { toDialableNumber } from '@/integrations/plivo/utils/plivoPhone';
import {
  PLIVO_CALL_OUTCOME_LABEL_KEYS,
  PLIVO_UNANSWERED_OUTCOMES,
  formatPlivoDuration,
  getPlivoCallOutcome,
  getPlivoCounterpartLabel,
} from '@/integrations/plivo/utils/plivoHistoryUtils';
import { safeFormatDate } from '@/integrations/call/utils/callUtils';

/**
 * One call in the history list, expanding to its audio.
 *
 * The player is collapsed by default and mounted only once opened: a page of
 * twenty rows would otherwise create twenty `<audio>` elements, and even with
 * `preload="none"` that is twenty DOM subtrees for audio nobody asked to hear.
 */
export const PlivoCallHistoryRow = ({
  callHistory,
}: {
  callHistory: IPlivoCallHistory;
}) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const { dial, isReady } = usePlivoDialer();
  const [isOpen, setIsOpen] = useState(false);

  const {
    direction,
    counterpartNumber,
    duration,
    recordUrl,
    recordingDuration,
    isVoicemail,
    voicemailLeftAt,
    conversationId,
    createdAt,
    startedAt,
  } = callHistory;

  const outcome = getPlivoCallOutcome(callHistory);
  const isUnanswered = PLIVO_UNANSWERED_OUTCOMES.includes(outcome);
  const label = getPlivoCounterpartLabel(callHistory);

  // Parsed here rather than at click time so a number that was stored malformed
  // (or an anonymous/withheld caller) hides the button instead of failing on
  // press. A missed call from a blocked number is exactly where a dead
  // call-back button would otherwise sit.
  const callBackNumber = toDialableNumber(counterpartNumber);

  const renderDirectionIcon = () => {
    if (isVoicemail) {
      return <IconMailbox className="size-4 shrink-0 text-warning" />;
    }

    if (isUnanswered) {
      return <IconPhoneX className="size-4 shrink-0 text-destructive" />;
    }

    return direction === 'inbound' ? (
      <IconPhoneIncoming className="size-4 shrink-0 text-success" />
    ) : (
      <IconPhoneOutgoing className="size-4 shrink-0 text-success" />
    );
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        'rounded-lg border px-2 py-1.5',
        isVoicemail ? 'border-warning/30 bg-warning/5' : 'border-transparent',
      )}
    >
      <div className="flex items-center gap-2">
        {renderDirectionIcon()}

        <div className="flex min-w-0 flex-auto flex-col">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'truncate text-sm font-medium',
                isVoicemail && 'text-warning',
                !isVoicemail && isUnanswered && 'text-destructive',
              )}
              title={counterpartNumber || label}
            >
              {label || t('plivo-unknown-caller')}
            </span>
            <Badge
              variant={
                outcome === 'answered'
                  ? 'success'
                  : outcome === 'voicemail'
                  ? 'warning'
                  : isUnanswered
                  ? 'destructive'
                  : 'secondary'
              }
            >
              {t(PLIVO_CALL_OUTCOME_LABEL_KEYS[outcome])}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-accent-foreground">
            <span>
              {safeFormatDate(startedAt || createdAt, 'MMM dd, HH:mm')}
            </span>
            {/* A voicemail's length is the MESSAGE, not a conversation, so it
                is labelled apart from a call's talk time. */}
            {isVoicemail ? (
              <span>
                {t('plivo-voicemail-length')}:{' '}
                {formatPlivoDuration(recordingDuration)}
              </span>
            ) : (
              !!duration && <span>{formatPlivoDuration(duration)}</span>
            )}
          </div>
          {isVoicemail && voicemailLeftAt && (
            <div className="text-xs text-warning">
              {t('plivo-voicemail-left-at')}:{' '}
              {safeFormatDate(voicemailLeftAt, 'MMM dd, HH:mm')}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {recordUrl && (
            <Tooltip.Provider>
              <Tooltip>
                <Tooltip.Trigger asChild>
                  <Collapsible.Trigger asChild>
                    <Button variant="ghost" size="icon" className="size-6">
                      {isOpen ? (
                        <IconChevronDown />
                      ) : isVoicemail ? (
                        <IconMailbox className="text-warning" />
                      ) : (
                        <IconPlayerPlay />
                      )}
                    </Button>
                  </Collapsible.Trigger>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {isVoicemail
                    ? t('plivo-play-voicemail')
                    : t('plivo-play-recording')}
                </Tooltip.Content>
              </Tooltip>
            </Tooltip.Provider>
          )}

          {callBackNumber && isReady && (
            <Tooltip.Provider>
              <Tooltip>
                <Tooltip.Trigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    aria-label={t('plivo-call-back')}
                    onClick={() => dial(callBackNumber)}
                  >
                    <IconPhoneOutgoing />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>{t('plivo-call-back')}</Tooltip.Content>
              </Tooltip>
            </Tooltip.Provider>
          )}

          {conversationId && (
            <Tooltip.Provider>
              <Tooltip>
                <Tooltip.Trigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() =>
                      navigate(
                        `/frontline/inbox?conversationId=${conversationId}`,
                      )
                    }
                  >
                    <IconArrowUpRight />
                  </Button>
                </Tooltip.Trigger>
                <Tooltip.Content>{t('go-to-conversation')}</Tooltip.Content>
              </Tooltip>
            </Tooltip.Provider>
          )}
        </div>
      </div>

      {recordUrl && (
        <Collapsible.Content>
          <PlivoRecordingPlayer
            recordUrl={recordUrl}
            isVoicemail={isVoicemail}
            className="mt-2"
          />
        </Collapsible.Content>
      )}
    </Collapsible>
  );
};
