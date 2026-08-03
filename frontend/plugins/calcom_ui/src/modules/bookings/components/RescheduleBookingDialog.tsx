import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Calendar, Dialog, Form, Textarea } from 'erxes-ui';
import { startOfDay } from 'date-fns';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { SlotPicker } from '~/modules/bookings/components/SlotPicker';
import { useCalcomBookingActions } from '~/modules/bookings/hooks/useCalcomBookingActions';

const schema = z.object({
  // Required, and validated as a real selection rather than a free-text time:
  // the value always comes from a slot Cal.com offered, so a booking cannot be
  // attempted against a time that was never available.
  start: z.string().min(1, 'Pick a new time'),
  reschedulingReason: z
    .string()
    .trim()
    .max(500, 'Keep the reason under 500 characters')
    .optional(),
});

type FormValues = z.infer<typeof schema>;

export const RescheduleBookingDialog = ({
  uid,
  eventTypeId,
  title,
  open,
  onOpenChange,
}: {
  uid?: string;
  eventTypeId?: number;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { rescheduleBooking, pending } = useCalcomBookingActions();
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { start: '', reschedulingReason: '' },
  });

  const onSubmit = async ({ start, reschedulingReason }: FormValues) => {
    if (!uid) return;

    const ok = await rescheduleBooking(
      uid,
      start,
      reschedulingReason || undefined,
    );

    if (ok) {
      form.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="sm:max-w-lg">
        <Dialog.Header>
          <Dialog.Title>Reschedule booking</Dialog.Title>
          <Dialog.Description>
            {title
              ? `Pick a new time for “${title}”. Cal.com cancels the original and notifies everyone.`
              : 'Pick a new time. Cal.com cancels the original booking and notifies everyone.'}
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="shrink-0">
                <Calendar
                  mode="single"
                  selected={day}
                  onSelect={(next) => {
                    if (!next) return;

                    setDay(startOfDay(next));
                    // Clearing the slot on a day change is load-bearing: the
                    // chosen time belongs to the previous day, and keeping it
                    // would submit a start that is no longer on screen.
                    form.setValue('start', '', { shouldValidate: false });
                  }}
                  // Past days hold no bookable slots; offering them would only
                  // produce an empty list and look broken.
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

            <Form.Field
              control={form.control}
              name="reschedulingReason"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Reason (optional)</Form.Label>
                  <Form.Control>
                    <Textarea
                      {...field}
                      rows={2}
                      placeholder="Shared with the attendee"
                    />
                  </Form.Control>
                  <Form.Message />
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
                {pending ? 'Rescheduling…' : 'Reschedule'}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
