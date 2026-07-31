import { Label, Select } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { IPlivoSoftphoneIntegration } from '@/integrations/plivo/types/plivoTypes';

/**
 * Chooses which connected Plivo number this browser answers on, from inside the
 * widget itself.
 *
 * The same choice used to be reachable only from the channel settings page, so
 * an agent who never went there never saw a softphone at all. It stays an
 * explicit choice when there is more than one number — answering the wrong
 * queue is worse than one click — but it is now made where the phone is.
 */
export const PlivoNumberPicker = ({
  integrations,
  value,
  onValueChange,
}: {
  integrations: IPlivoSoftphoneIntegration[];
  value: string | null;
  onValueChange: (integrationId: string) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('plivo-softphone-number')}</Label>
      <Select value={value ?? undefined} onValueChange={onValueChange}>
        <Select.Trigger className="w-full">
          <Select.Value placeholder={t('plivo-softphone-select')} />
        </Select.Trigger>
        <Select.Content>
          {integrations.map((integration) => (
            <Select.Item key={integration._id} value={integration._id}>
              {integration.phoneNumber
                ? `${integration.name} (${integration.phoneNumber})`
                : integration.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </div>
  );
};
