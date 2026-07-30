import { zodResolver } from '@hookform/resolvers/zod';
import { IconPlus } from '@tabler/icons-react';
import { Button, Form, Input, Sheet, Spinner, Switch } from 'erxes-ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SelectBrands } from 'ui-modules';
import { z } from 'zod';
import { IntegrationSteps } from '@/integrations/components/IntegrationSteps';
import { useIntegrationAdd } from '@/integrations/hooks/useIntegrationAdd';
import { IntegrationType } from '@/types/Integration';
import { PlivoSoftphoneSelect } from '@/integrations/plivo/components/PlivoSoftphoneSelect';
import { PLIVO_INTEGRATION_SCHEMA } from '../constants/plivoSchema';

type PlivoFormValues = z.infer<typeof PLIVO_INTEGRATION_SCHEMA>;

const DEFAULT_VALUES: PlivoFormValues = {
  name: '',
  brandId: '',
  authId: '',
  authToken: '',
  plivoPhoneNumber: '',
  appId: '',
  defaultCountryCode: '',
  recordCalls: false,
};

export const PlivoIntegrationDetail = () => {
  const { t } = useTranslation('frontline');
  const { id: channelId } = useParams();
  const [open, setOpen] = useState(false);
  const { addIntegration, loading } = useIntegrationAdd();

  const form = useForm<PlivoFormValues>({
    resolver: zodResolver(PLIVO_INTEGRATION_SCHEMA),
    defaultValues: DEFAULT_VALUES,
  });

  /**
   * `data` is forwarded as a plain object: the inbox resolver stringifies it
   * before handing it to the Plivo service, so stringifying here would
   * double-encode the credentials.
   */
  const onSubmit = (values: PlivoFormValues) => {
    addIntegration({
      variables: {
        kind: IntegrationType.PLIVO_CALL,
        name: values.name,
        channelId: channelId as string,
        brandId: values.brandId,
        data: {
          authId: values.authId.trim(),
          authToken: values.authToken.trim(),
          plivoPhoneNumber: values.plivoPhoneNumber.trim(),
          appId: values.appId?.trim() || undefined,
          defaultCountryCode: values.defaultCountryCode?.trim() || undefined,
          recordCalls: values.recordCalls,
        },
      },
      onCompleted: () => {
        setOpen(false);
        // The auth token is never read back from the server, so clearing the
        // form is the only way it stops living in memory after a save.
        form.reset(DEFAULT_VALUES);
      },
    });
  };

  return (
    // skipcq: JS-0415
    <div className="flex items-center gap-3">
      <PlivoSoftphoneSelect />
      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) form.reset(DEFAULT_VALUES);
        }}
      >
        <Sheet.Trigger asChild>
          <Button>
            <IconPlus />
            {t('plivo-add-number')}
          </Button>
        </Sheet.Trigger>
        <Sheet.View>
          <Form {...form}>
            <form
              className="flex flex-col flex-1 overflow-hidden"
              onSubmit={form.handleSubmit(onSubmit)}
            >
              <Sheet.Header>
                <Sheet.Title>{t('plivo-add-number')}</Sheet.Title>
                <Sheet.Description>
                  {t('plivo-connect-description')}
                </Sheet.Description>
                <Sheet.Close />
              </Sheet.Header>

              <Sheet.Content className="flex flex-col overflow-hidden">
                <IntegrationSteps
                  step={1}
                  stepsLength={1}
                  title={t('plivo-credentials')}
                  description={t('plivo-credentials-description')}
                />
                <div className="flex-1 overflow-auto p-4 pt-0 flex flex-col gap-4">
                  <Form.Field
                    name="authId"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>{t('plivo-auth-id')}</Form.Label>
                        <Form.Control>
                          <Input {...field} autoComplete="off" />
                        </Form.Control>
                        <Form.Description>
                          {t('plivo-auth-id-description')}
                        </Form.Description>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />

                  <Form.Field
                    name="authToken"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>{t('plivo-auth-token')}</Form.Label>
                        <Form.Control>
                          <Input
                            {...field}
                            type="password"
                            autoComplete="new-password"
                          />
                        </Form.Control>
                        <Form.Description>
                          {t('plivo-auth-token-description')}
                        </Form.Description>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />

                  <Form.Field
                    name="plivoPhoneNumber"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>{t('plivo-phone-number')}</Form.Label>
                        <Form.Control>
                          <Input {...field} placeholder="+14155550123" />
                        </Form.Control>
                        <Form.Description>
                          {t('plivo-phone-number-description')}
                        </Form.Description>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />

                  <Form.Field
                    name="appId"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>{t('plivo-app-id')}</Form.Label>
                        <Form.Control>
                          <Input {...field} autoComplete="off" />
                        </Form.Control>
                        <Form.Description>
                          {t('plivo-app-id-description')}
                        </Form.Description>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />

                  <Form.Field
                    name="defaultCountryCode"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>
                          {t('plivo-default-country-code')}
                        </Form.Label>
                        <Form.Control>
                          <Input {...field} placeholder="+91" />
                        </Form.Control>
                        <Form.Description>
                          {t('plivo-default-country-code-description')}
                        </Form.Description>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />

                  <Form.Field
                    name="recordCalls"
                    render={({ field }) => (
                      <Form.Item>
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

                  <Form.Field
                    name="name"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>{t('integration-name')}</Form.Label>
                        <Form.Control>
                          <Input {...field} />
                        </Form.Control>
                        <Form.Description>
                          {t('integration-name-description')}
                        </Form.Description>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />

                  <Form.Field
                    name="brandId"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>{t('brand')}</Form.Label>
                        <Form.Control>
                          <SelectBrands.FormItem
                            value={field.value}
                            onValueChange={field.onChange}
                          />
                        </Form.Control>
                        <Form.Description>
                          {t('choose-brand-description')}
                        </Form.Description>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />
                </div>
              </Sheet.Content>

              <Sheet.Footer>
                <Sheet.Close asChild>
                  <Button
                    className="mr-auto text-muted-foreground"
                    variant="ghost"
                    type="button"
                  >
                    {t('cancel')}
                  </Button>
                </Sheet.Close>
                <Button type="submit" disabled={loading}>
                  {loading && <Spinner size="sm" />}
                  {t('save')}
                </Button>
              </Sheet.Footer>
            </form>
          </Form>
        </Sheet.View>
      </Sheet>
    </div>
  );
};
