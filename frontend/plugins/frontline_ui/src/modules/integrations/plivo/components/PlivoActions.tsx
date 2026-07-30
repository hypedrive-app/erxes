import {
  IconAntennaBars3,
  IconAntennaBars5,
  IconPower,
  IconRefresh,
} from '@tabler/icons-react';
import { Badge, Button, Tooltip } from 'erxes-ui';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { usePlivo } from '@/integrations/plivo/components/PlivoProvider';
import {
  plivoStateAtom,
  plivoUnregisteredAtom,
} from '@/integrations/plivo/states/plivoStates';
import {
  PlivoCallQualityEnum,
  PlivoCallStatusEnum,
  PlivoErrorTypeEnum,
  PlivoStatusEnum,
} from '@/integrations/plivo/types/plivoTypes';

export const PlivoActions = () => {
  return (
    <div className="flex items-center gap-2">
      <PlivoStatusBadge />
      <PlivoQualityIndicator />
      <PlivoPowerButton />
    </div>
  );
};

export const PlivoStatusBadge = () => {
  const { t } = useTranslation('frontline');
  const { plivoStatus, plivoErrorMessage, plivoErrorType } =
    useAtomValue(plivoStateAtom);
  const isUnregistered = useAtomValue(plivoUnregisteredAtom);

  if (plivoStatus === PlivoStatusEnum.CONNECTING) {
    return <Badge variant="warning">{t('connecting')}</Badge>;
  }

  if (plivoStatus === PlivoStatusEnum.ERROR) {
    return (
      <Tooltip.Provider>
        <Tooltip>
          <Tooltip.Trigger asChild>
            <Badge variant="destructive">
              {plivoErrorType === PlivoErrorTypeEnum.MEDIA_PERMISSION
                ? t('plivo-mic-denied')
                : t('connection-error')}
            </Badge>
          </Tooltip.Trigger>
          {plivoErrorMessage && (
            <Tooltip.Content>{plivoErrorMessage}</Tooltip.Content>
          )}
        </Tooltip>
      </Tooltip.Provider>
    );
  }

  const isOnline =
    plivoStatus === PlivoStatusEnum.REGISTERED && !isUnregistered;

  return (
    <Badge variant={isOnline ? 'success' : 'destructive'}>
      {isOnline ? t('online') : t('offline')}
    </Badge>
  );
};

/**
 * Live call quality from the SDK's `mediaMetrics` event.
 *
 * Hidden unless a call is up and a metric has actually arrived — the event is
 * Chrome-only, so on other browsers an indicator would sit permanently at
 * "unknown" and read as a fault rather than as an unsupported feature.
 */
export const PlivoQualityIndicator = () => {
  const { t } = useTranslation('frontline');
  const { callStatus, callQuality } = useAtomValue(plivoStateAtom);

  if (
    callStatus !== PlivoCallStatusEnum.ACTIVE ||
    callQuality === PlivoCallQualityEnum.UNKNOWN
  ) {
    return null;
  }

  const isDegraded = callQuality === PlivoCallQualityEnum.DEGRADED;

  return (
    <Tooltip.Provider>
      <Tooltip>
        <Tooltip.Trigger asChild>
          <Badge variant={isDegraded ? 'warning' : 'success'}>
            {isDegraded ? <IconAntennaBars3 /> : <IconAntennaBars5 />}
          </Badge>
        </Tooltip.Trigger>
        <Tooltip.Content>
          {isDegraded ? t('plivo-quality-poor') : t('plivo-quality-good')}
        </Tooltip.Content>
      </Tooltip>
    </Tooltip.Provider>
  );
};

export const PlivoPowerButton = () => {
  const { t } = useTranslation('frontline');
  const { reconnectPlivo, unregisterPlivo } = usePlivo();
  const { plivoStatus } = useAtomValue(plivoStateAtom);

  const isRegistered = plivoStatus === PlivoStatusEnum.REGISTERED;
  const needsReconnect =
    plivoStatus === PlivoStatusEnum.ERROR ||
    plivoStatus === PlivoStatusEnum.DISCONNECTED;

  if (needsReconnect) {
    return (
      <Button size="sm" variant="secondary" onClick={reconnectPlivo}>
        <IconRefresh /> {t('reconnect')}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={plivoStatus === PlivoStatusEnum.CONNECTING}
      onClick={isRegistered ? unregisterPlivo : reconnectPlivo}
    >
      <IconPower /> {isRegistered ? t('turn-off') : t('turn-on')}
    </Button>
  );
};
