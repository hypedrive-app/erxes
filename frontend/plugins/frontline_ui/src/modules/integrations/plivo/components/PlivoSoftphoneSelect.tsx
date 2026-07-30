import { Label, Select, Spinner } from 'erxes-ui';
import { useAtom } from 'jotai';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useIntegrations } from '@/integrations/hooks/useIntegrations';
import { IntegrationType } from '@/types/Integration';
import { plivoIntegrationIdAtom } from '@/integrations/plivo/states/plivoStates';

/** Sentinel for "no number", since Select cannot hold an empty string value. */
const NONE_VALUE = 'none';

/**
 * Chooses which connected Plivo number this browser answers on.
 *
 * Selecting one mounts the floating softphone and registers a SIP endpoint for
 * this agent; clearing it logs the browser out. The choice is per-agent and
 * per-browser, so two agents on the same number each get their own endpoint.
 */
export const PlivoSoftphoneSelect = () => {
  const { t } = useTranslation('frontline');
  const { id: channelId } = useParams();
  const [activeIntegrationId, setActiveIntegrationId] = useAtom(
    plivoIntegrationIdAtom,
  );

  const { integrations, loading } = useIntegrations({
    variables: { kind: IntegrationType.PLIVO_CALL, channelId },
    skip: !channelId,
  });

  if (loading) {
    return <Spinner size="sm" />;
  }

  if (!integrations?.length) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Label className="whitespace-nowrap">{t('plivo-softphone')}</Label>
      <Select
        value={activeIntegrationId ?? NONE_VALUE}
        onValueChange={(value) =>
          setActiveIntegrationId(value === NONE_VALUE ? null : value)
        }
      >
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
