import { IconPhoneFilled } from '@tabler/icons-react';
import { Spinner } from 'erxes-ui';
import { useAtomValue } from 'jotai';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { PlivoNumberPicker } from '@/integrations/plivo/components/PlivoNumberPicker';
import { PlivoWidgetDraggableRoot } from '@/integrations/plivo/components/PlivoWidgetDraggable';
import { plivoWidgetOpenAtom } from '@/integrations/plivo/states/plivoStates';
import { IPlivoSoftphoneIntegration } from '@/integrations/plivo/types/plivoTypes';

/**
 * The launcher shown while the softphone cannot be mounted yet — no number
 * picked, or a token still being minted.
 *
 * It deliberately renders while OFFLINE rather than being absent. The call
 * client itself is still not mounted, so nothing here can look reachable when
 * it is not: the launcher carries the same offline colouring the real widget
 * uses when unregistered, and opening it says why. The alternative — rendering
 * nothing — is what made this bug unreportable, because "no softphone" and "no
 * deploy" looked identical to the agent.
 *
 * It reuses the real widget's draggable root, so it occupies the same remembered
 * position and does not jump when the client mounts.
 */
export const PlivoUnconfiguredWidget = ({
  integrations,
  integrationId,
  onIntegrationChange,
  connecting,
}: {
  integrations: IPlivoSoftphoneIntegration[];
  integrationId: string | null;
  onIntegrationChange: (integrationId: string) => void;
  connecting: boolean;
}) => {
  const { t } = useTranslation('frontline');
  const open = useAtomValue(plivoWidgetOpenAtom);

  return (
    <PopoverPrimitive.Root open={open}>
      <PlivoWidgetDraggableRoot
        label={t('plivo-softphone')}
        trigger={<IconPhoneFilled className="text-white" />}
      >
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            sideOffset={12}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 rounded-lg bg-background text-foreground shadow-lg w-96"
          >
            <div className="flex flex-col gap-3 p-4">
              {connecting ? (
                <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                  <Spinner size="sm" />
                  {t('plivo-softphone-connecting')}
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium">
                      {t('plivo-softphone-not-ready')}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('plivo-softphone-not-ready-description')}
                    </p>
                  </div>
                  <PlivoNumberPicker
                    integrations={integrations}
                    value={integrationId}
                    onValueChange={onIntegrationChange}
                  />
                </>
              )}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PlivoWidgetDraggableRoot>
    </PopoverPrimitive.Root>
  );
};
