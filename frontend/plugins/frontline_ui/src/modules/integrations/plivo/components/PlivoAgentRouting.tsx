import { useMutation, useQuery } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { IconDeviceMobile } from '@tabler/icons-react';
import {
  Button,
  Dialog,
  Form,
  Input,
  Select,
  Spinner,
  Switch,
  toast,
} from 'erxes-ui';
import { useAtomValue } from 'jotai';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { SAVE_PLIVO_AGENT_ROUTING } from '../graphql/mutations/savePlivoAgentRouting';
import { PLIVO_AGENT_ROUTING } from '../graphql/queries/plivoAgentRouting';
import { plivoIntegrationIdAtom } from '../states/plivoStates';

const schema = z
  .object({
    device: z.enum(['browser', 'phone', 'both']),
    phoneNumber: z.string().trim().optional(),
    available: z.boolean(),
  })
  // Checked here as well as on the server: choosing a handset without giving a
  // number would otherwise save cleanly and then silently stop routing calls,
  // which is the exact failure this whole screen exists to prevent.
  .refine(
    (values) => values.device === 'browser' || !!values.phoneNumber?.trim(),
    {
      message: 'Add the number to ring',
      path: ['phoneNumber'],
    },
  );

type TFormValues = z.infer<typeof schema>;

/**
 * Lets an agent say where their calls should ring.
 *
 * Routing used to have one signal — whether this browser held a SIP
 * registration — which cannot express an agent at lunch, an agent already on a
 * call, or an agent whose network carries the signalling but drops the audio.
 * That last one is not hypothetical: a filtered campus network produces a call
 * that rings, is answered, and is silent, and the only escape was an
 * administrator changing an integration-wide setting that would have taken
 * every other agent's softphone down with it.
 *
 * Scoped to the calling agent by the resolver, with no way to name another —
 * a handset number is personal.
 */
export const PlivoAgentRouting = () => {
  const { t } = useTranslation('frontline');
  const integrationId = useAtomValue(plivoIntegrationIdAtom);
  const [open, setOpen] = useState(false);

  const { data, loading } = useQuery(PLIVO_AGENT_ROUTING, {
    variables: { integrationId },
    skip: !integrationId || !open,
    // The row can change from another tab, and a stale device here would show
    // an agent a setting they are not actually being routed by.
    fetchPolicy: 'network-only',
  });

  const [saveRouting, { loading: saving }] = useMutation(
    SAVE_PLIVO_AGENT_ROUTING,
  );

  const form = useForm<TFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { device: 'browser', phoneNumber: '', available: true },
  });

  const routing = data?.plivoAgentRouting;

  // Seeded once the query answers. `reset` rather than per-field setValue so
  // the form's dirty state starts clean and the agent is not shown unsaved
  // changes they never made.
  useEffect(() => {
    if (!routing) {
      return;
    }

    form.reset({
      device: routing.device || 'browser',
      phoneNumber: routing.phoneNumber || '',
      available: routing.available !== false,
    });
  }, [routing, form]);

  const device = form.watch('device');

  const onSubmit = (values: TFormValues) => {
    saveRouting({
      variables: {
        integrationId,
        device: values.device,
        phoneNumber: values.phoneNumber?.trim() || null,
        available: values.available,
      },
      onCompleted: () => {
        toast({ title: t('plivo-routing-saved') });
        setOpen(false);
      },
      onError: (error) =>
        toast({ title: error.message, variant: 'destructive' }),
    });
  };

  if (!integrationId) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-8">
          <IconDeviceMobile />
          {t('plivo-routing')}
        </Button>
      </Dialog.Trigger>

      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>{t('plivo-routing-title')}</Dialog.Title>
          <Dialog.Description>
            {t('plivo-routing-description')}
          </Dialog.Description>
        </Dialog.Header>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Spinner size="sm" />
            {t('loading')}
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <Form.Field
                control={form.control}
                name="device"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>{t('plivo-routing-device')}</Form.Label>
                    <Form.Control>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <Select.Trigger>
                          <Select.Value />
                        </Select.Trigger>
                        <Select.Content>
                          <Select.Item value="browser">
                            {t('plivo-routing-device-browser')}
                          </Select.Item>
                          <Select.Item value="phone">
                            {t('plivo-routing-device-phone')}
                          </Select.Item>
                          <Select.Item value="both">
                            {t('plivo-routing-device-both')}
                          </Select.Item>
                        </Select.Content>
                      </Select>
                    </Form.Control>
                    <Form.Description>
                      {t(`plivo-routing-device-${device}-hint`)}
                    </Form.Description>
                    <Form.Message />
                  </Form.Item>
                )}
              />

              {device !== 'browser' && (
                <Form.Field
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>{t('plivo-routing-number')}</Form.Label>
                      <Form.Control>
                        <Input
                          {...field}
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="+91"
                        />
                      </Form.Control>
                      <Form.Description>
                        {t('plivo-routing-number-description')}
                      </Form.Description>
                      <Form.Message />
                    </Form.Item>
                  )}
                />
              )}

              <Form.Field
                control={form.control}
                name="available"
                render={({ field }) => (
                  <Form.Item>
                    <div className="flex items-center justify-between">
                      <Form.Label>{t('plivo-routing-available')}</Form.Label>
                      <Form.Control>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </Form.Control>
                    </div>
                    <Form.Description>
                      {t('plivo-routing-available-description')}
                    </Form.Description>
                  </Form.Item>
                )}
              />

              <Dialog.Footer>
                <Button type="submit" disabled={saving}>
                  {saving && <Spinner size="sm" />}
                  {t('save')}
                </Button>
              </Dialog.Footer>
            </form>
          </Form>
        )}
      </Dialog.Content>
    </Dialog>
  );
};
