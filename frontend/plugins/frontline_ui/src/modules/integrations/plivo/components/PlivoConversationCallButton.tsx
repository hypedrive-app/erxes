import { IconPhone } from '@tabler/icons-react';
import { Button, Tooltip, formatPhoneNumber } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useConversationContext } from '@/inbox/conversations/conversation-detail/hooks/useConversationContext';
import { usePlivoCountry } from '@/integrations/plivo/hooks/usePlivoCountry';
import { usePlivoDialer } from '@/integrations/plivo/hooks/usePlivoDialer';
import { toDialableNumber } from '@/integrations/plivo/utils/plivoPhone';

/**
 * One-click call to the customer in the open conversation.
 *
 * Renders nothing unless there is a dialable number *and* the softphone is
 * live, so an agent is never shown a call button that cannot place a call.
 * Only `primaryPhone` is considered: the conversation detail query selects
 * that field alone on the customer, and widening it to the full `phones[]`
 * array would mean an extra round trip for a header button.
 *
 * The number is validated to E.164 here rather than at click time so an
 * unparseable stored number hides the button instead of failing on press.
 */
export const PlivoConversationCallButton = () => {
  const { t } = useTranslation('frontline');
  const { customer } = useConversationContext();
  const { dial, isReady } = usePlivoDialer();
  const country = usePlivoCountry();

  const destination = toDialableNumber(customer?.primaryPhone, country);

  if (!destination || !isReady) return null;

  const label = t('plivo-call-customer', {
    number: formatPhoneNumber({
      value: customer?.primaryPhone ?? '',
      defaultCountry: country,
    }),
  });

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="[&>svg]:size-4 flex-none"
          aria-label={label}
          onClick={() => dial(destination)}
        >
          <IconPhone />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
};
