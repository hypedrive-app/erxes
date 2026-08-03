import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Dialog, Form, Textarea } from 'erxes-ui';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useCalcomBookingActions } from '~/modules/bookings/hooks/useCalcomBookingActions';

const schema = z.object({
  // Optional, but trimmed and length-capped. Cal.com shows this reason to the
  // attendee in the cancellation email, so it is user-visible text, not an
  // internal note — an accidental 5000-character paste should not go out.
  cancellationReason: z
    .string()
    .trim()
    .max(500, 'Keep the reason under 500 characters')
    .optional(),
});

type FormValues = z.infer<typeof schema>;

export const CancelBookingDialog = ({
  uid,
  title,
  open,
  onOpenChange,
}: {
  uid?: string;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { cancelBooking, pending } = useCalcomBookingActions();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { cancellationReason: '' },
  });

  const onSubmit = async ({ cancellationReason }: FormValues) => {
    if (!uid) return;

    const ok = await cancelBooking(uid, cancellationReason || undefined);

    // Closed only on success. A failure keeps the dialog open with the typed
    // reason intact, so the user can retry rather than re-type it — the toast
    // alone would leave them looking at a list that did not change.
    if (ok) {
      form.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="sm:max-w-md">
        <Dialog.Header>
          <Dialog.Title>Cancel booking</Dialog.Title>
          <Dialog.Description>
            {title
              ? `“${title}” will be cancelled in Cal.com and the attendees will be notified.`
              : 'This booking will be cancelled in Cal.com and the attendees will be notified.'}
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Form.Field
              control={form.control}
              name="cancellationReason"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Reason (optional)</Form.Label>
                  <Form.Control>
                    <Textarea
                      {...field}
                      rows={3}
                      placeholder="Shared with the attendee in the cancellation email"
                    />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Dialog.Footer>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={pending}>
                  Keep booking
                </Button>
              </Dialog.Close>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? 'Cancelling…' : 'Cancel booking'}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
