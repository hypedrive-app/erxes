import { IconPhone } from '@tabler/icons-react';
import { Button, Tooltip, formatPhoneNumber } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useCustomerDetail } from 'ui-modules';
import { usePlivoDialer } from '@/integrations/plivo/hooks/usePlivoDialer';
import {
  PLIVO_DEFAULT_COUNTRY,
  toDialableNumber,
} from '@/integrations/plivo/utils/plivoPhone';

/**
 * One-click call to the customer whose record is open.
 *
 * This renders inside the plugin's own `conversation` relation widget, which
 * the customer detail sheet already mounts over module federation. That keeps
 * the affordance entirely inside `frontline_ui`: the contacts UI lives in
 * `core-ui`/`ui-modules` and cannot import from a plugin, and `IUIConfig`
 * exposes no action-button slot on the detail header.
 *
 * The customer is fetched rather than passed down because the relation widget
 * receives only a `customerId` across the federation boundary. `useCustomerDetail`
 * is a shared `ui-modules` hook and its query already selects `primaryPhone`,
 * so this adds no new GraphQL document and no widened selection set.
 */
export const PlivoContactCallButton = ({
  customerId,
}: {
  customerId?: string;
}) => {
  const { t } = useTranslation('frontline');
  const { dial, isReady } = usePlivoDialer();
  const { customerDetail } = useCustomerDetail({
    variables: { _id: customerId },
    skip: !customerId,
  });

  // Validated to E.164 during render so a contact stored with an unparseable
  // number simply has no button, rather than one that fails when pressed.
  const destination = toDialableNumber(customerDetail?.primaryPhone);

  if (!destination || !isReady) return null;

  const label = t('plivo-call-customer', {
    number: formatPhoneNumber({
      value: customerDetail?.primaryPhone ?? '',
      defaultCountry: PLIVO_DEFAULT_COUNTRY,
    }),
  });

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <Button
          variant="secondary"
          size="sm"
          aria-label={label}
          onClick={() => dial(destination)}
        >
          <IconPhone className="size-3.5" />
          {t('plivo-call-contact')}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
};
