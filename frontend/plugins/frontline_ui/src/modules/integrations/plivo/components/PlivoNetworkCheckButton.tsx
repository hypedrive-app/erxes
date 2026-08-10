import { IconNetwork } from '@tabler/icons-react';
import { Button, Spinner, Tooltip, toast } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { checkPlivoNetwork } from '../utils/plivoNetworkCheck';

/**
 * Lets an agent find out whether this network can carry a call, without
 * putting a customer through one to find out.
 *
 * Registration succeeding proves only that the signalling got out on 443. The
 * media travels a different path, and a network that drops it produces a call
 * that connects and then sits in silence — so an agent on a filtered network
 * looks online, right up until the first call fails.
 */
export const PlivoNetworkCheckButton = () => {
  const { t } = useTranslation('frontline');
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    setChecking(true);

    try {
      const result = await checkPlivoNetwork();

      // Logged as well as shown: the candidate types are what a support
      // conversation actually needs, and a toast is gone in seconds.
      console.info(
        `[plivo] network check: ${result.verdict} (${
          result.candidateTypes.join(', ') || 'no candidates'
        }) in ${result.elapsedMs}ms`,
      );

      if (result.verdict === 'ok') {
        toast({ title: t('plivo-network-ok') });
        return;
      }

      if (result.verdict === 'blocked') {
        toast({
          title: t('plivo-network-blocked'),
          description: t('plivo-network-blocked-detail'),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('plivo-network-unknown'),
        description: t('plivo-network-unknown-detail'),
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <Tooltip>
      <Tooltip.Trigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={checking}
          onClick={handleCheck}
        >
          {checking ? <Spinner size="sm" /> : <IconNetwork />}
          {t('plivo-network-check')}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content side="top" sideOffset={4}>
        {t('plivo-network-check-description')}
      </Tooltip.Content>
    </Tooltip>
  );
};
