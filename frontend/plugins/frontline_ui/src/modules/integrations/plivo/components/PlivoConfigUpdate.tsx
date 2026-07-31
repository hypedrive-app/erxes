import { IntegrationLogo } from '@/integrations/components/IntegrationLogo';
import { INTEGRATIONS } from '@/integrations/constants/integrations';
import { useIntegrationEdit } from '@/integrations/hooks/useIntegrationEdit';
import {
  PLIVO_CONFIG_SCHEMA,
  PlivoConfigValues,
} from '@/integrations/plivo/constants/plivoConfigSchema';
import { usePlivoIntegrationConfigs } from '@/integrations/plivo/hooks/usePlivoIntegrationConfigs';
import { IPlivoIntegrationConfig } from '@/integrations/plivo/types/plivoTypes';
import { IntegrationType } from '@/types/Integration';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconAlertTriangle } from '@tabler/icons-react';
import {
  Button,
  Collapsible,
  Dialog,
  Form,
  getPluginAssetsUrl,
  Input,
  Separator,
  Skeleton,
  Spinner,
  Switch,
  Textarea,
  toast,
} from 'erxes-ui';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

export const PlivoConfigUpdateCollapse = () => {
  const { t } = useTranslation('frontline');

  return (
    <Collapsible className="w-full bg-muted rounded-lg">
      <Collapsible.Trigger asChild>
        <Button
          variant="secondary"
          className="w-full h-auto flex justify-start group bg-transparent hover:bg-transparent gap-3 px-3 font-semibold"
        >
          <Collapsible.TriggerIcon className="text-accent-foreground" />
          <IntegrationLogo
            img={getPluginAssetsUrl(
              'frontline',
              INTEGRATIONS[IntegrationType.PLIVO_CALL].img,
            )}
            name={INTEGRATIONS[IntegrationType.PLIVO_CALL].name}
          />
          {t('plivo-config')}
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content className="shadow-xs rounded-lg p-3 bg-background">
        <PlivoConfigUpdate />
      </Collapsible.Content>
    </Collapsible>
  );
};

/**
 * Call routing for every connected Plivo number.
 *
 * One form per number rather than a single global form: routing is per-number,
 * and each saves through the integration's own edit mutation.
 */
export const PlivoConfigUpdate = () => {
  const { t } = useTranslation('frontline');
  const { configs, loading, error } = usePlivoIntegrationConfigs();

  if (loading && !configs.length) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
        <Skeleton className="h-8" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">{t('plivo-config-load-error')}</p>
    );
  }

  if (!configs.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('plivo-config-no-numbers')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {configs.map((config) => (
        <PlivoNumberConfigForm key={config._id} config={config} />
      ))}
    </div>
  );
};

const PlivoNumberConfigForm = ({
  config,
}: {
  config: IPlivoIntegrationConfig;
}) => {
  const { t } = useTranslation('frontline');
  const { editIntegration, loading } = useIntegrationEdit();

  const form = useForm<PlivoConfigValues>({
    resolver: zodResolver(PLIVO_CONFIG_SCHEMA),
    // The query returns effective values, so these are what routing is doing
    // right now — not blanks that would be saved back over live settings.
    values: {
      _id: config._id,
      ringAgents: config.ringAgents,
      agentRingTimeout: config.agentRingTimeout,
      forwardToNumber: config.forwardToNumber ?? '',
      forwardTimeout: config.forwardTimeout,
      voicemailEnabled: config.voicemailEnabled,
      voicemailMaxLength: config.voicemailMaxLength,
      voicemailGreeting: config.voicemailGreeting ?? '',
      recordCalls: config.recordCalls,
    },
  });

  const ringAgents = form.watch('ringAgents');
  const voicemailEnabled = form.watch('voicemailEnabled');

  /**
   * Routing is saved through the integration's own edit mutation, which hands
   * `details` to the Plivo service. That service re-verifies the stored
   * credentials against the Plivo API before writing, so a number whose token
   * has been rotated fails here with a message rather than saving settings onto
   * a dead integration.
   */
  const onSubmit = (values: PlivoConfigValues) => {
    editIntegration({
      variables: {
        _id: config._id,
        name: config.name || config.plivoPhoneNumber || config._id,
        // Left empty on purpose: the resolver only writes `channelId` when it is
        // truthy, and this form does not own the channel.
        channelId: '',
        details: {
          ringAgents: values.ringAgents,
          agentRingTimeout: values.agentRingTimeout,
          forwardToNumber: values.forwardToNumber?.trim() || '',
          forwardTimeout: values.forwardTimeout,
          voicemailEnabled: values.voicemailEnabled,
          voicemailMaxLength: values.voicemailMaxLength,
          voicemailGreeting: values.voicemailGreeting.trim(),
          recordCalls: values.recordCalls,
        },
      },
      onCompleted: () => {
        toast({ title: t('plivo-config-updated'), variant: 'success' });
      },
      onError: (mutationError: { message: string }) => {
        toast({ title: mutationError.message, variant: 'destructive' });
      },
    });
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">
            {config.name || t('plivo-config-unnamed')}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {config.plivoPhoneNumber}
          </p>
        </div>
        {config.healthStatus === 'error' && (
          <div className="flex items-center gap-1.5 text-destructive shrink-0">
            <IconAlertTriangle size={16} />
            <span className="text-sm">{t('plivo-config-unhealthy')}</span>
          </div>
        )}
      </div>

      {config.healthStatus === 'error' && config.error && (
        <p className="text-sm text-destructive pb-3">{config.error}</p>
      )}

      <Separator />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid grid-cols-2 gap-3 pt-3"
        >
          <Form.Field
            name="ringAgents"
            render={({ field }) => (
              <Form.Item className="col-span-2">
                <div className="flex items-center justify-between">
                  <Form.Label>{t('plivo-ring-agents')}</Form.Label>
                  <Form.Control>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Form.Control>
                </div>
                <Form.Description>
                  {t('plivo-ring-agents-description')}
                </Form.Description>
                <Form.Message />
              </Form.Item>
            )}
          />

          {ringAgents && (
            <Form.Field
              name="agentRingTimeout"
              render={({ field }) => (
                <Form.Item className="col-span-2">
                  <Form.Label>{t('plivo-agent-ring-timeout')}</Form.Label>
                  <Form.Control>
                    <Input {...field} inputMode="numeric" />
                  </Form.Control>
                  <Form.Description>
                    {t('plivo-agent-ring-timeout-description')}
                  </Form.Description>
                  <Form.Message />
                </Form.Item>
              )}
            />
          )}

          <Form.Field
            name="forwardToNumber"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t('plivo-forward-to-number')}</Form.Label>
                <Form.Control>
                  <Input {...field} placeholder="+919000000000" />
                </Form.Control>
                <Form.Description>
                  {t('plivo-forward-to-number-description')}
                </Form.Description>
                <Form.Message />
              </Form.Item>
            )}
          />

          <Form.Field
            name="forwardTimeout"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>{t('plivo-forward-timeout')}</Form.Label>
                <Form.Control>
                  <Input {...field} inputMode="numeric" />
                </Form.Control>
                <Form.Description>
                  {t('plivo-forward-timeout-description')}
                </Form.Description>
                <Form.Message />
              </Form.Item>
            )}
          />

          <Form.Field
            name="voicemailEnabled"
            render={({ field }) => (
              <Form.Item className="col-span-2">
                <div className="flex items-center justify-between">
                  <Form.Label>{t('plivo-voicemail-enabled')}</Form.Label>
                  <Form.Control>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Form.Control>
                </div>
                <Form.Description>
                  {t('plivo-voicemail-enabled-description')}
                </Form.Description>
                <Form.Message />
              </Form.Item>
            )}
          />

          {voicemailEnabled && (
            <>
              <Form.Field
                name="voicemailMaxLength"
                render={({ field }) => (
                  <Form.Item className="col-span-2">
                    <Form.Label>{t('plivo-voicemail-max-length')}</Form.Label>
                    <Form.Control>
                      <Input {...field} inputMode="numeric" />
                    </Form.Control>
                    <Form.Description>
                      {t('plivo-voicemail-max-length-description')}
                    </Form.Description>
                    <Form.Message />
                  </Form.Item>
                )}
              />

              <Form.Field
                name="voicemailGreeting"
                render={({ field }) => (
                  <Form.Item className="col-span-2">
                    <Form.Label>{t('plivo-voicemail-greeting')}</Form.Label>
                    <Form.Control>
                      <Textarea {...field} />
                    </Form.Control>
                    <Form.Description>
                      {t('plivo-voicemail-greeting-description')}
                    </Form.Description>
                    <Form.Message />
                  </Form.Item>
                )}
              />
            </>
          )}

          <Form.Field
            name="recordCalls"
            render={({ field }) => (
              <Form.Item className="col-span-2">
                <div className="flex items-center justify-between">
                  <Form.Label>{t('plivo-record-calls')}</Form.Label>
                  <Form.Control>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </Form.Control>
                </div>
                <Form.Description>
                  {t('plivo-record-calls-description')}
                </Form.Description>
                <Form.Message />
              </Form.Item>
            )}
          />

          <Dialog.Footer className="col-span-2 items-center">
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner /> : t('save')}
            </Button>
          </Dialog.Footer>
        </form>
      </Form>
    </div>
  );
};
