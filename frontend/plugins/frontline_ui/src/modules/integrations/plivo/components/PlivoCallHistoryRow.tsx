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
import { usePlivoCountry } from '@/integrations/plivo/hooks/usePlivoCountry';
import { usePlivoDialer } from '@/integrations/plivo/hooks/usePlivoDialer';
import { IPlivoCallHistory } from '@/integrations/plivo/types/plivoTypes';
import { toDialableNumber } from '@/integrations/plivo/utils/plivoPhone';
import {
  PLIVO_CALL_OUTCOME_LABEL_KEYS,
  PLIVO_UNANSWERED_OUTCOMES,
  formatPlivoCost,
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
  const country = usePlivoCountry();
  const [isOpen, setIsOpen] = useState(false);

  const {
    direction,
    counterpartNumber,
    duration,
    totalCost,
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
  const callBackNumber = toDialableNumber(counterpartNumber, country);

  // The glyph alone already separates inbound from outbound from voicemail from
  // failed, so direction and outcome survive without their colour. The tinted
  // disc behind it adds a second, non-hue channel — shape — at scan distance.
  const renderDirectionIcon = () => {
    const wrap = (icon: React.ReactNode, tone: string) => (
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full [&>svg]:size-4',
          tone,
        )}
      >
        {icon}
      </span>
    );

    if (isVoicemail) {
      return wrap(<IconMailbox />, 'bg-warning/10 text-warning');
    }

    if (isUnanswered) {
      return wrap(<IconPhoneX />, 'bg-destructive/10 text-destructive');
    }

    return direction === 'inbound'
      ? wrap(<IconPhoneIncoming />, 'bg-success/10 text-success')
      : wrap(<IconPhoneOutgoing />, 'bg-accent text-accent-foreground');
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
            {/* The word is the outcome; the badge's colour only reinforces it,
                so a greyscale read loses nothing. */}
            <Badge
              className="shrink-0"
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
            {/* What Plivo charged. Shown here rather than on the agent's live
                widget: it is an operational figure for whoever reviews the
                log, and putting a running cost in front of an agent mid-call
                changes how they talk to the customer.

                `> 0` rather than truthiness so a genuinely free call is
                omitted rather than rendering as a bare currency symbol. */}
            {!!totalCost && totalCost > 0 && (
              <span title={t('plivo-call-cost')}>
                {formatPlivoCost(totalCost)}
              </span>
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 [&>svg]:size-4"
                      aria-label={
                        isVoicemail
                          ? t('plivo-play-voicemail')
                          : t('plivo-play-recording')
                      }
                    >
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
                    className="size-11 [&>svg]:size-4"
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
                    className="size-11 [&>svg]:size-4"
                    aria-label={t('go-to-conversation')}
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
