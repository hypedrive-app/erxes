import {
  IconAlertTriangle,
  IconAntennaBars3,
  IconAntennaBars5,
  IconCircleFilled,
  IconCircleOff,
  IconLoader2,
  IconPower,
  IconRefresh,
} from '@tabler/icons-react';
import { Badge, Button, Tooltip } from 'erxes-ui';
import { PlivoNetworkCheckButton } from './PlivoNetworkCheckButton';
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
      {/* Sits before the power button so the row reads status, then checks,
          then the one control that changes state. */}
      <PlivoNetworkCheckButton />
      <PlivoPowerButton />
    </div>
  );
};

export const PlivoStatusBadge = () => {
  const { t } = useTranslation('frontline');
  const { plivoStatus, plivoErrorMessage, plivoErrorType } =
    useAtomValue(plivoStateAtom);
  const isUnregistered = useAtomValue(plivoUnregisteredAtom);

  // Every registration state carries its own icon, so online/offline/connecting
  // are told apart by shape and wording as well as by the badge's hue.
  if (plivoStatus === PlivoStatusEnum.CONNECTING) {
    return (
      <Badge variant="warning">
        <IconLoader2 className="size-3 motion-safe:animate-spin" />
        {t('connecting')}
      </Badge>
    );
  }

  if (plivoStatus === PlivoStatusEnum.ERROR) {
    return (
      <Tooltip.Provider>
        <Tooltip>
          <Tooltip.Trigger asChild>
            <Badge variant="destructive">
              <IconAlertTriangle className="size-3" />
              {plivoErrorType === PlivoErrorTypeEnum.MEDIA_PERMISSION
                ? t('plivo-mic-denied')
                : t('connection-error')}
            </Badge>
          </Tooltip.Trigger>
          {/* The retry guard's terminal message lands here; without it the
              badge says only "connection error" and the agent has nothing to
              act on. */}
          {plivoErrorMessage && (
            <Tooltip.Content className="max-w-56">
              {plivoErrorMessage}
            </Tooltip.Content>
          )}
        </Tooltip>
      </Tooltip.Provider>
    );
  }

  const isOnline =
    plivoStatus === PlivoStatusEnum.REGISTERED && !isUnregistered;

  return (
    <Badge variant={isOnline ? 'success' : 'destructive'}>
      {isOnline ? (
        <IconCircleFilled className="size-2" />
      ) : (
        <IconCircleOff className="size-3" />
      )}
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

  // The bar count differs by shape and the quality is now spelled out, so this
  // no longer needs a tooltip to be understood — the label that used to hide in
  // one is on the badge itself, where it is readable on a touch device too.
  return (
    <Badge variant={isDegraded ? 'warning' : 'success'}>
      {isDegraded ? <IconAntennaBars3 /> : <IconAntennaBars5 />}
      {isDegraded ? t('plivo-quality-poor') : t('plivo-quality-good')}
    </Badge>
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
      <Button
        size="sm"
        variant="secondary"
        // 24px was under the 24px WCAG floor once its border was counted, and
        // this is the button that gets an offline agent back online.
        className="ml-auto h-8"
        onClick={reconnectPlivo}
      >
        <IconRefresh /> {t('reconnect')}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="secondary"
      className="ml-auto h-8"
      disabled={plivoStatus === PlivoStatusEnum.CONNECTING}
      onClick={isRegistered ? unregisterPlivo : reconnectPlivo}
    >
      <IconPower /> {isRegistered ? t('turn-off') : t('turn-on')}
    </Button>
  );
};
