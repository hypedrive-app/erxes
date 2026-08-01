import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'erxes-ui';
import {
  plivoDialRequestAtom,
  plivoReadyAtom,
} from '@/integrations/plivo/states/plivoStates';
import { usePlivoCountry } from '@/integrations/plivo/hooks/usePlivoCountry';
import { toDialableNumber } from '@/integrations/plivo/utils/plivoPhone';

/**
 * Places a call to an already-known number from anywhere in the app.
 *
 * Rather than calling the SDK directly, this raises a request on a shared atom
 * which the mounted softphone consumes. The Plivo client lives in the
 * `floatingWidget` federation entry and call buttons do not, so the React
 * context is unreachable from them; `jotai` is shared between entries and is
 * the one channel that genuinely crosses that boundary.
 *
 * The number is normalised to E.164 here so every caller dials the same way,
 * and an unparseable number is reported instead of being handed to the SDK,
 * where it would surface later as an opaque failed call.
 */
export const usePlivoDialer = () => {
  const { t } = useTranslation('frontline');
  const requestDial = useSetAtom(plivoDialRequestAtom);
  const isReady = useAtomValue(plivoReadyAtom);
  const country = usePlivoCountry();

  const dial = useCallback(
    (rawNumber?: string | null) => {
      if (!isReady) return;

      const destination = toDialableNumber(rawNumber, country);

      if (!destination) {
        toast({
          title: t('plivo-invalid-number'),
          description: t('plivo-invalid-number-description'),
          variant: 'destructive',
        });
        return;
      }

      // `id` keeps two calls to the same number distinguishable, so the widget
      // does not treat a redial as an already-handled request.
      requestDial({ id: Date.now(), destination });
    },
    [country, isReady, requestDial, t],
  );

  return { dial, isReady };
};
