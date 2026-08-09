import { Spinner, toast, useConfirm } from 'erxes-ui';
import { IconTrash } from '@tabler/icons-react';
import { REMOVE_INTEGRATION } from '@/integrations/graphql/mutations/RemoveIntegration';
import { getIntegrationRemovalEffectKey } from '@/integrations/constants/integrationRemovalEffects';
import { useMutation } from '@apollo/client';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export const RemoveIntegration = ({
  _id,
  name,
}: {
  _id: string;
  name: string;
}) => {
  const { t } = useTranslation('frontline');
  const [removeIntegration, { loading }] = useMutation(REMOVE_INTEGRATION, {
    refetchQueries: [
      'Integrations',
      'IntegrationsGetUsedTypes',
      'IntegrationsGetUsedTypesByChannel',
    ],
    onCompleted() {
      toast({
        title: t('integration-removed'),
        variant: 'default',
      });
    },
    onError(e) {
      toast({
        title: t('failed-to-remove-integration'),
        description: e?.message,
        variant: 'destructive',
      });
    },
  });

  const { confirm } = useConfirm();
  const { integrationType } = useParams();

  const removalEffectKey = getIntegrationRemovalEffectKey(integrationType);

  const handleRemove = () => {
    confirm({
      message: t('confirm-remove-integration', { name }),
      // Kinds that cascade delete conversation history state exactly what goes
      // and ask for the name to be typed, because nothing restores it
      // afterwards. Kinds that only drop the integration row keep the plain
      // confirmation.
      options: removalEffectKey
        ? {
            description: t(removalEffectKey, { name }),
            confirmationValue: name,
            okLabel: t('remove'),
          }
        : undefined,
    }).then(() => {
      removeIntegration({ variables: { id: _id } });
    });
  };

  return (
    <div
      onClick={handleRemove}
      className="flex items-center gap-2 w-full text-destructive"
    >
      {loading ? <Spinner className="size-4" /> : <IconTrash size={16} />}
      {t('remove')}
    </div>
  );
};
