import { useMutation } from '@apollo/client';
import { IconTransfer } from '@tabler/icons-react';
import { Button, Input, Popover, Spinner, Tooltip, toast } from 'erxes-ui';
import { useAtomValue } from 'jotai';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TRANSFER_PLIVO_CALL } from '../graphql/mutations/transferPlivoCall';
import {
  plivoIntegrationIdAtom,
  plivoStateAtom,
} from '../states/plivoStates';

/**
 * Hands the caller to another number.
 *
 * Blind transfer: the caller is moved and this agent's leg is released. That
 * is why it confirms nothing and closes immediately — once Plivo has been told
 * to redirect the leg, this agent is no longer on the call and has nothing
 * left to watch.
 *
 * Disabled until the call is actually up. A transfer needs Plivo's CallUUID,
 * which only exists once the call has been answered — `onCallAnswered` is what
 * puts it on `callId`.
 */
export const PlivoTransferButton = () => {
  const { t } = useTranslation('frontline');
  const { callId } = useAtomValue(plivoStateAtom);
  const integrationId = useAtomValue(plivoIntegrationIdAtom);
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState('');

  const [transferCall, { loading }] = useMutation(TRANSFER_PLIVO_CALL);

  const canTransfer = !!callId && !!integrationId;

  const handleTransfer = () => {
    const to = destination.trim();

    if (!to || !callId || !integrationId) {
      return;
    }

    transferCall({
      variables: { integrationId, callUuid: callId, to },
      onCompleted: () => {
        toast({ title: t('plivo-transfer-sent') });
        setDestination('');
        setOpen(false);
      },
      onError: (error) =>
        toast({ title: error.message, variant: 'destructive' }),
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={!canTransfer}
              aria-label={t('plivo-transfer')}
            >
              <IconTransfer className="size-4" />
            </Button>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Content side="top" sideOffset={4}>
          {t('plivo-transfer')}
        </Tooltip.Content>
      </Tooltip>

      <Popover.Content side="top" className="w-64 p-3">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t('plivo-transfer')}</p>
          <p className="text-xs text-muted-foreground">
            {t('plivo-transfer-description')}
          </p>
          <Input
            value={destination}
            autoFocus
            inputMode="tel"
            placeholder={t('plivo-transfer-placeholder')}
            onChange={(event) => setDestination(event.target.value)}
            // Enter is how a number typed in a hurry gets sent; the button is
            // there for the pointer, not as the only way through.
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleTransfer();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={loading || !destination.trim()}
            onClick={handleTransfer}
          >
            {loading ? <Spinner size="sm" /> : <IconTransfer className="size-4" />}
            {t('plivo-transfer-confirm')}
          </Button>
        </div>
      </Popover.Content>
    </Popover>
  );
};
