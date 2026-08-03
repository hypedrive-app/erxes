import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Calendar, Dialog, Form, Input, Select } from 'erxes-ui';
import { startOfDay } from 'date-fns';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { SlotPicker } from '~/modules/bookings/components/SlotPicker';
import { useCalcomBookingActions } from '~/modules/bookings/hooks/useCalcomBookingActions';
import { useCalcomEventTypes } from '~/modules/bookings/hooks/useCalcomScheduling';

const schema = z.object({
  eventTypeId: z.coerce
    .number()
    .int()
    .positive('Choose what to book'),
  start: z.string().min(1, 'Pick a time'),
  name: z.string().trim().min(1, 'Name is required'),
  // Validated here rather than left to Cal.com: an invalid address is
  // rejected on submit with an opaque API error, and it is also the field the
  // booking's customer link depends on.
  email: z.string().trim().email('Enter a valid email'),
});

type FormValues = z.infer<typeof schema>;

/**
 * Books a Cal.com time on behalf of a contact.
 *
 * The contact's id is passed through to Cal.com as metadata and echoed back on
 * the webhook, so the resulting booking attaches to THIS contact even if they
 * book under an address the CRM has not seen before.
 */
export const CreateBookingDialog = ({
  customerId,
  defaultName,
  defaultEmail,
  open,
  onOpenChange,
}: {
  customerId?: string;
  defaultName?: string;
  defaultEmail?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { createBooking, pending } = useCalcomBookingActions();
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));

  // Only fetched while the dialog is open: event types are a live read, and
  // there is no reason to call Cal.com for a panel nobody has opened.
  const { eventTypes, loading: loadingTypes } = useCalcomEventTypes({
    skip: !open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      eventTypeId: undefined,
      start: '',
      name: defaultName ?? '',
      email: defaultEmail ?? '',
    },
  });

  // The contact's details arrive from the panel after first render, so the
  // defaults are applied once they exist — but only into fields the user has
  // not already edited, so this cannot overwrite typing in progress.
  useEffect(() => {
    if (!open) return;

    if (defaultName && !form.getValues('name')) {
      form.setValue('name', defaultName);
    }

    if (defaultEmail && !form.getValues('email')) {
      form.setValue('email', defaultEmail);
    }
  }, [open, defaultName, defaultEmail, form]);

  const eventTypeId = form.watch('eventTypeId');

  const onSubmit = async (values: FormValues) => {
    const ok = await createBooking({
      eventTypeId: values.eventTypeId,
      start: values.start,
      attendee: { name: values.name, email: values.email },
      customerId,
    });

    if (ok) {
      form.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="sm:max-w-lg">
        <Dialog.Header>
          <Dialog.Title>Book a time</Dialog.Title>
          <Dialog.Description>
            Creates the booking in Cal.com and sends the usual confirmation.
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Form.Field
              control={form.control}
              name="eventTypeId"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Event type</Form.Label>
                  <Select
                    value={field.value ? String(field.value) : undefined}
                    onValueChange={(next) => {
                      field.onChange(Number(next));
                      // A different event type has different durations and
                      // availability, so any slot picked under the previous one
                      // is no longer valid.
                      form.setValue('start', '', { shouldValidate: false });
                    }}
                  >
                    <Form.Control>
                      <Select.Trigger>
                        <Select.Value
                          placeholder={
                            loadingTypes ? 'Loading…' : 'Choose what to book'
                          }
                        />
                      </Select.Trigger>
                    </Form.Control>
                    <Select.Content>
                      {eventTypes.map((type) => (
                        <Select.Item key={type.id} value={String(type.id)}>
                          {type.title}
                          {type.length ? ` · ${type.length} min` : ''}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                  <Form.Message />
                </Form.Item>
              )}
            />

            {/* Only shown once there is an event type — the slot list is
                meaningless without one, and rendering an empty picker reads as
                "no availability" rather than "nothing chosen yet". */}
            {!!eventTypeId && (
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="shrink-0">
                  <Calendar
                    mode="single"
                    selected={day}
                    onSelect={(next) => {
                      if (!next) return;

                      setDay(startOfDay(next));
                      form.setValue('start', '', { shouldValidate: false });
                    }}
                    disabled={{ before: startOfDay(new Date()) }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <Form.Field
                    control={form.control}
                    name="start"
                    render={({ field }) => (
                      <Form.Item>
                        <Form.Label>Available times</Form.Label>
                        <SlotPicker
                          eventTypeId={eventTypeId}
                          day={day}
                          value={field.value}
                          onChange={(slot) =>
                            form.setValue('start', slot, {
                              shouldValidate: true,
                            })
                          }
                          disabled={!open}
                        />
                        <Form.Message />
                      </Form.Item>
                    )}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Form.Field
                control={form.control}
                name="name"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Attendee name</Form.Label>
                    <Form.Control>
                      <Input {...field} placeholder="Full name" />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />

              <Form.Field
                control={form.control}
                name="email"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label>Attendee email</Form.Label>
                    <Form.Control>
                      <Input
                        {...field}
                        type="email"
                        placeholder="name@example.com"
                      />
                    </Form.Control>
                    <Form.Message />
                  </Form.Item>
                )}
              />
            </div>

            <Dialog.Footer>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={pending}>
                {pending ? 'Booking…' : 'Book'}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
