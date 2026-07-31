import { Label, Select, Spinner } from 'erxes-ui';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { usePlivoSoftphoneIntegrations } from '@/integrations/plivo/hooks/usePlivoSoftphoneIntegrations';
import { plivoUnregisteredAtom } from '@/integrations/plivo/states/plivoStates';

/** Sentinel for "no number", since Select cannot hold an empty string value. */
const NONE_VALUE = 'none';

/**
 * Chooses which connected Plivo number this browser answers on.
 *
 * Selecting one mounts the floating softphone and registers a SIP endpoint for
 * this agent; clearing it logs the browser out. The choice is per-agent and
 * per-browser, so two agents on the same number each get their own endpoint.
 *
 * This is no longer the only way to reach the softphone — the widget selects a
 * lone number by itself and offers the same picker — so it is now a convenience
 * on the settings page rather than a prerequisite. It reads the same
 * account-wide list as the widget so the two can never disagree about which
 * numbers exist.
 */
export const PlivoSoftphoneSelect = () => {
  const { t } = useTranslation('frontline');
  const { integrations, integrationId, setIntegrationId, loading } =
    usePlivoSoftphoneIntegrations();
  const setUnregistered = useSetAtom(plivoUnregisteredAtom);

  // "Off" is a deliberate go-offline, so it is recorded as one. Otherwise an
  // account with a single number would have it auto-selected again immediately
  // and the choice would appear not to work.
  const handleValueChange = (value: string) => {
    const isOff = value === NONE_VALUE;

    setUnregistered(isOff);
    setIntegrationId(isOff ? null : value);
  };

  if (loading && !integrations.length) {
    return <Spinner size="sm" />;
  }

  if (!integrations.length) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Label className="whitespace-nowrap">{t('plivo-softphone')}</Label>
      <Select value={integrationId ?? NONE_VALUE} onValueChange={handleValueChange}>
        <Select.Trigger className="w-56">
          <Select.Value placeholder={t('plivo-softphone-select')} />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={NONE_VALUE}>
            {t('plivo-softphone-off')}
          </Select.Item>
          {integrations.map((integration) => (
            <Select.Item key={integration._id} value={integration._id}>
              {integration.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
  );
};
