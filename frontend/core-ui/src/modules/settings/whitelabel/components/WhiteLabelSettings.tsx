import { useMutation, useQuery } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, Input, Skeleton, Switch, Textarea, toast } from 'erxes-ui';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  ORG_WHITE_LABEL,
  ORG_WHITE_LABEL_EDIT,
} from '~/modules/settings/whitelabel/graphql/whiteLabel';
import { applyAccentColor } from '~/theme/applyRuntimeTheme';

/**
 * Matches the backend's validation exactly. Both ends check, deliberately:
 * the browser so the operator gets an immediate answer, the server because
 * this value is written into a CSS custom property in everyone's browser and
 * cannot be trusted from the client.
 */
const HEX_COLOUR = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const schema = z.object({
  enabled: z.boolean(),
  orgShortName: z.string().trim().max(60).optional(),
  orgShortDescription: z.string().trim().max(200).optional(),
  orgLogo: z.string().trim().url('Enter a full URL').or(z.literal('')).optional(),
  orgFavicon: z
    .string()
    .trim()
    .url('Enter a full URL')
    .or(z.literal(''))
    .optional(),
  orgAccentColor: z
    .string()
    .trim()
    .regex(HEX_COLOUR, 'Use a hex colour like #3B90FA')
    .or(z.literal(''))
    .optional(),
  orgLoginText: z.string().trim().max(120).optional(),
  orgLoginDescription: z.string().trim().max(400).optional(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  enabled: false,
  orgShortName: '',
  orgShortDescription: '',
  orgLogo: '',
  orgFavicon: '',
  orgAccentColor: '',
  orgLoginText: '',
  orgLoginDescription: '',
};

/**
 * Instance-wide branding.
 *
 * The accent colour retints the whole app without a rebuild: it is converted
 * to oklch in the browser and written onto two CSS custom properties that 18
 * theme tokens are expressed against. Everything else here was already stored
 * and already sent to the browser at boot — it just had no way to be edited.
 */
export const WhiteLabelSettings = () => {
  const { data, loading } = useQuery<{ orgWhiteLabel: FormValues | null }>(
    ORG_WHITE_LABEL,
  );

  const [save, { loading: saving }] = useMutation(ORG_WHITE_LABEL_EDIT, {
    refetchQueries: [ORG_WHITE_LABEL],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const { reset } = form;

  // Populated once the query lands. reset rather than setValue per field so
  // the form's dirty state starts clean and "unsaved changes" means it.
  useEffect(() => {
    if (!data?.orgWhiteLabel) return;

    reset({ ...EMPTY, ...data.orgWhiteLabel });
  }, [data, reset]);

  const accent = form.watch('orgAccentColor');
  const enabled = form.watch('enabled');

  // Previewed live so the operator sees the colour before committing to it —
  // this is the one setting whose effect is impossible to judge from a hex
  // string. Reverted on unmount, so navigating away without saving does not
  // leave the app retinted.
  useEffect(() => {
    if (!enabled || !accent || !HEX_COLOUR.test(accent)) return;

    applyAccentColor(accent);
  }, [accent, enabled]);

  const onSubmit = async (values: FormValues) => {
    try {
      await save({ variables: values });

      toast({
        title: 'Branding saved',
        description: values.enabled
          ? 'Applied across this instance.'
          : 'Saved, but white-labelling is turned off.',
      });
    } catch (e) {
      toast({
        title: 'Could not save',
        description: e instanceof Error ? e.message : 'Something went wrong',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">White-labelling</h1>
        <p className="mt-1 text-muted-foreground">
          Replace the erxes name, logo and accent colour with your own. Changes
          apply on the next page load — no redeploy.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Form.Field
            control={form.control}
            name="enabled"
            render={({ field }) => (
              <Form.Item className="flex flex-row items-center justify-between rounded-md border p-4">
                <div className="pr-4">
                  <Form.Label>Use custom branding</Form.Label>
                  <Form.Description>
                    {/* The master switch is honoured server-side too:
                        /initial-setup only merges these values when enabled,
                        so turning it off restores stock erxes without
                        discarding what was configured. */}
                    Turning this off restores the stock erxes branding without
                    losing what you have set here.
                  </Form.Description>
                </div>
                <Form.Control>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </Form.Control>
              </Form.Item>
            )}
          />

          <Form.Field
            control={form.control}
            name="orgAccentColor"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>Accent colour</Form.Label>
                <div className="flex items-center gap-3">
                  <Form.Control>
                    <Input {...field} placeholder="#3B90FA" className="flex-1" />
                  </Form.Control>
                  {/* A native colour input beside the text field: operators
                      paste a hex from a brand guide, but picking is easier
                      when they do not have one. */}
                  <input
                    type="color"
                    aria-label="Pick accent colour"
                    value={
                      accent && HEX_COLOUR.test(accent) && accent.length >= 7
                        ? accent
                        : '#3B90FA'
                    }
                    onChange={(e) => field.onChange(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded-md border bg-transparent"
                  />
                </div>
                <Form.Description>
                  Buttons, links, highlights and charts. Previewed live while
                  you type.
                </Form.Description>
                <Form.Message />
              </Form.Item>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Form.Field
              control={form.control}
              name="orgShortName"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Name</Form.Label>
                  <Form.Control>
                    <Input {...field} placeholder="Sharks Marketing" />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="orgShortDescription"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Short description</Form.Label>
                  <Form.Control>
                    <Input {...field} placeholder="Shown alongside the name" />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Form.Field
              control={form.control}
              name="orgLogo"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Logo URL</Form.Label>
                  <Form.Control>
                    <Input {...field} placeholder="https://…/logo.svg" />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="orgFavicon"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Favicon URL</Form.Label>
                  <Form.Control>
                    <Input {...field} placeholder="https://…/favicon.ico" />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />
          </div>

          <Form.Field
            control={form.control}
            name="orgLoginText"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>Login heading</Form.Label>
                <Form.Control>
                  <Input {...field} placeholder="Welcome back" />
                </Form.Control>
                <Form.Message />
              </Form.Item>
            )}
          />

          <Form.Field
            control={form.control}
            name="orgLoginDescription"
            render={({ field }) => (
              <Form.Item>
                <Form.Label>Login description</Form.Label>
                <Form.Control>
                  <Textarea {...field} rows={2} />
                </Form.Control>
                <Form.Message />
              </Form.Item>
            )}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save branding'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};
