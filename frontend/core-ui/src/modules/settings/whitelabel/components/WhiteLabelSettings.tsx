import { useMutation, useQuery } from '@apollo/client';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Form,
  Input,
  Separator,
  Skeleton,
  Switch,
  Textarea,
  Upload,
  toast,
} from 'erxes-ui';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  ORG_WHITE_LABEL,
  ORG_WHITE_LABEL_EDIT,
} from '~/modules/settings/whitelabel/graphql/whiteLabel';
import { applyAccentColor } from '~/theme/applyRuntimeTheme';
import { WhiteLabelPreview } from '~/modules/settings/whitelabel/components/WhiteLabelPreview';

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
  orgLogo: z.string().trim().optional(),
  orgFavicon: z.string().trim().optional(),
  orgAccentColor: z
    .string()
    .trim()
    .regex(HEX_COLOUR, 'Use a hex colour like #3B90FA')
    .or(z.literal(''))
    .optional(),
  orgLoginText: z.string().trim().max(120).optional(),
  orgLoginDescription: z.string().trim().max(400).optional(),
});

export type WhiteLabelFormValues = z.infer<typeof schema>;

const EMPTY: WhiteLabelFormValues = {
  enabled: false,
  orgShortName: '',
  orgShortDescription: '',
  orgLogo: '',
  orgFavicon: '',
  orgAccentColor: '',
  orgLoginText: '',
  orgLoginDescription: '',
};

const SectionHeading = ({
  title,
  description,
}: {
  title: string;
  description: string;
}) => (
  <div>
    <h2 className="text-sm font-semibold">{title}</h2>
    <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
  </div>
);

/**
 * Instance-wide branding.
 *
 * The accent colour retints the whole app without a rebuild: it is converted
 * to oklch in the browser and written onto two CSS custom properties that 18
 * theme tokens are expressed against — including this very page, which is why
 * the mock login preview beside the form needs no separate colour plumbing of
 * its own. Everything else here was already stored and already sent to the
 * browser at boot — it just had no way to be edited.
 */
export const WhiteLabelSettings = () => {
  const { data, loading } = useQuery<{ orgWhiteLabel: WhiteLabelFormValues | null }>(
    ORG_WHITE_LABEL,
  );

  const [save, { loading: saving }] = useMutation(ORG_WHITE_LABEL_EDIT, {
    refetchQueries: [ORG_WHITE_LABEL],
  });

  const form = useForm<WhiteLabelFormValues>({
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

  const onSubmit = async (values: WhiteLabelFormValues) => {
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
      <div className="grid gap-8 p-6 max-w-6xl lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-144 w-full rounded-xl hidden lg:block" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">White-labelling</h1>
        <p className="mt-1 text-muted-foreground">
          Replace the erxes name, logo and accent colour with your own.
          Changes apply on the next page load — no redeploy.
        </p>
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-8 lg:grid-cols-2 lg:items-start"
        >
          <div className="flex flex-col gap-8 min-w-0">
            <Form.Field
              control={form.control}
              name="enabled"
              render={({ field }) => (
                <Form.Item className="flex flex-row items-center justify-between rounded-xl border bg-sidebar p-4">
                  <div className="pr-4">
                    <Form.Label className="text-base">
                      Use custom branding
                    </Form.Label>
                    <Form.Description>
                      {/* The master switch is honoured server-side too:
                          /initial-setup only merges these values when enabled,
                          so turning it off restores stock erxes without
                          losing what you have set here. */}
                      Turning this off restores the stock erxes branding
                      without losing what you have set here.
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

            <div
              className={
                enabled
                  ? 'flex flex-col gap-5'
                  : 'flex flex-col gap-5 opacity-50 pointer-events-none'
              }
              aria-disabled={!enabled}
              // Dimmed rather than removed while off: the fields underneath
              // are still what gets restored the moment the switch flips back
              // on, so hiding them would make the toggle look like it erases
              // configuration instead of merely suspending it.
            >
              <div className="flex flex-col gap-5">
                <SectionHeading
                  title="Identity"
                  description="Shown in the sidebar, browser tab and anywhere the erxes name would otherwise appear."
                />

                <div className="flex gap-6">
                  <Form.Field
                    control={form.control}
                    name="orgLogo"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>Logo</Form.Label>
                        <Form.Control>
                          {/* Only value/onChange are passed through, not the
                              rest of `field` — spreading RHF's own onChange
                              onto Upload.Root would give it a signature that
                              is ALSO a plain DOM event handler, and the two
                              disagree on what their single argument is. */}
                          <Upload.Root
                            value={field.value ?? ''}
                            onChange={(fileInfo) =>
                              field.onChange(fileInfo?.url ?? '')
                            }
                          >
                            <Upload.Preview />
                            <div className="flex flex-col justify-center gap-2">
                              <div className="flex gap-2">
                                <Upload.Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                />
                                <Upload.RemoveButton
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                />
                              </div>
                              <Form.Description>
                                Square or wide, transparent background works
                                best.
                              </Form.Description>
                            </div>
                          </Upload.Root>
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
                        <Form.Label>Favicon</Form.Label>
                        <Form.Control>
                          {/* Only value/onChange are passed through, not the
                              rest of `field` — spreading RHF's own onChange
                              onto Upload.Root would give it a signature that
                              is ALSO a plain DOM event handler, and the two
                              disagree on what their single argument is. */}
                          <Upload.Root
                            value={field.value ?? ''}
                            onChange={(fileInfo) =>
                              field.onChange(fileInfo?.url ?? '')
                            }
                          >
                            <Upload.Preview />
                            <div className="flex flex-col justify-center gap-2">
                              <div className="flex gap-2">
                                <Upload.Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                />
                                <Upload.RemoveButton
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                />
                              </div>
                              <Form.Description>
                                Square, at least 32×32.
                              </Form.Description>
                            </div>
                          </Upload.Root>
                        </Form.Control>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />
                </div>

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
                          <Input
                            {...field}
                            placeholder="Shown alongside the name"
                          />
                        </Form.Control>
                        <Form.Message />
                      </Form.Item>
                    )}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-5">
                <SectionHeading
                  title="Accent colour"
                  description="Buttons, links, highlights and charts across the whole app."
                />

                <Form.Field
                  control={form.control}
                  name="orgAccentColor"
                  render={({ field }) => (
                    <Form.Item>
                      <div className="flex items-center gap-3">
                        <Form.Control>
                          <Input
                            {...field}
                            placeholder="#3B90FA"
                            className="flex-1"
                          />
                        </Form.Control>
                        {/* A native colour input beside the text field:
                            operators paste a hex from a brand guide, but
                            picking is easier when they do not have one. */}
                        <input
                          type="color"
                          aria-label="Pick accent colour"
                          value={
                            accent &&
                            HEX_COLOUR.test(accent) &&
                            accent.length >= 7
                              ? accent
                              : '#3B90FA'
                          }
                          onChange={(e) => field.onChange(e.target.value)}
                          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent"
                        />
                      </div>
                      <Form.Description>
                        Previewed live, on this page and the mock beside it.
                      </Form.Description>
                      <Form.Message />
                    </Form.Item>
                  )}
                />
              </div>

              <Separator />

              <div className="flex flex-col gap-5">
                <SectionHeading
                  title="Login screen"
                  description="The heading and description shown beside the sign-in form."
                />

                <Form.Field
                  control={form.control}
                  name="orgLoginText"
                  render={({ field }) => (
                    <Form.Item>
                      <Form.Label>Heading</Form.Label>
                      <Form.Control>
                        <Input
                          {...field}
                          placeholder="Grow your business better and faster"
                        />
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
                      <Form.Label>Description</Form.Label>
                      <Form.Control>
                        <Textarea {...field} rows={3} />
                      </Form.Control>
                      <Form.Message />
                    </Form.Item>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save branding'}
              </Button>
            </div>
          </div>

          <div className="hidden lg:block lg:sticky lg:top-6">
            <WhiteLabelPreview
              logo={form.watch('orgLogo')}
              loginText={form.watch('orgLoginText')}
              loginDescription={form.watch('orgLoginDescription')}
              enabled={enabled}
            />
          </div>
        </form>
      </Form>
    </div>
  );
};
