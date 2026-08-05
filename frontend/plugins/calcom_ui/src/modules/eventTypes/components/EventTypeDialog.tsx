import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Dialog, Form, Input, Switch, Textarea } from 'erxes-ui';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useCalcomEventTypeActions } from '~/modules/eventTypes/hooks/useCalcomEventTypeActions';
import { ICalcomEventTypeListItem } from '~/modules/eventTypes/types/eventType';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  lengthInMinutes: z.coerce.number().int().positive('Must be at least 1 minute'),
  description: z.string().trim().optional(),
  hidden: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

/**
 * One dialog for both create and edit. `eventType` present means editing —
 * same shape as the rest of the plugin avoiding a second near-identical form.
 */
export const EventTypeDialog = ({
  eventType,
  open,
  onOpenChange,
}: {
  eventType?: ICalcomEventTypeListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { pending, createEventType, updateEventType } =
    useCalcomEventTypeActions();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      slug: '',
      lengthInMinutes: 30,
      description: '',
      hidden: false,
    },
  });

  // Reset to the target row's values each time the dialog opens, rather than
  // once on mount — the same dialog instance is reused for every row.
  useEffect(() => {
    if (!open) return;

    form.reset({
      title: eventType?.title ?? '',
      slug: eventType?.slug ?? '',
      lengthInMinutes: eventType?.length ?? 30,
      description: eventType?.description ?? '',
      hidden: eventType?.hidden ?? false,
    });
  }, [open, eventType, form]);

  const onSubmit = async (values: FormValues) => {
    const ok = eventType
      ? await updateEventType(eventType.id, values)
      : await createEventType(values);

    if (ok) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="sm:max-w-lg">
        <Dialog.Header>
          <Dialog.Title>
            {eventType ? 'Edit event type' : 'New event type'}
          </Dialog.Title>
          <Dialog.Description>
            {eventType
              ? 'Changes are saved directly to Cal.com.'
              : 'Creates a bookable event type in Cal.com.'}
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Form.Field
                control={form.control}
                name="title"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Title</Form.Label>
                    <Form.Control>
                      <Input {...field} placeholder="30 Minute Meeting" />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />

              <Form.Field
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Slug</Form.Label>
                    <Form.Control>
                      <Input {...field} placeholder="30-minute-meeting" />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />
            </div>

            <Form.Field
              control={form.control}
              name="lengthInMinutes"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Duration (minutes)</Form.Label>
                  <Form.Control>
                    <Input {...field} type="number" min={1} />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="description"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Description (optional)</Form.Label>
                  <Form.Control>
                    <Textarea {...field} rows={3} />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="hidden"
              render={({ field }) => (
                <Form.Item className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Form.Label>Hidden</Form.Label>
                    <p className="text-sm text-muted-foreground">
                      Hidden event types cannot be booked from your public page.
                    </p>
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

            <Dialog.Footer>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : eventType ? 'Save changes' : 'Create'}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
