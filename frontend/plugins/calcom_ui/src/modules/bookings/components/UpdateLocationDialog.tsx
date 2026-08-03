import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Dialog, Form, Input, Select } from 'erxes-ui';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useCalcomBookingActions } from '~/modules/bookings/hooks/useCalcomBookingActions';

/**
 * The location shapes Cal.com accepts, verified against
 * UpdateBookingLocationInput_2024_08_13 in the fork's openapi.json.
 *
 * Each variant carries its value under a DIFFERENT key — address/link/phone —
 * discriminated by `type`. Sending the wrong key is rejected, so the mapping
 * lives here in one place rather than being reconstructed at the call site.
 */
const LOCATION_KINDS = {
  link: {
    label: 'Video link',
    field: 'link' as const,
    placeholder: 'https://meet.google.com/…',
    help: 'Any meeting URL — Google Meet, Zoom, Teams.',
  },
  address: {
    label: 'In person',
    field: 'address' as const,
    placeholder: '221B Baker Street, London',
    help: 'The organizer hosts at this address.',
  },
  attendeePhone: {
    label: 'Phone call',
    field: 'phone' as const,
    placeholder: '+91 98765 43210',
    help: "The attendee's number — the organizer calls them.",
  },
  attendeeAddress: {
    label: "Attendee's address",
    field: 'address' as const,
    placeholder: 'Where the attendee will be',
    help: 'The organizer travels to the attendee.',
  },
  attendeeDefined: {
    label: 'Attendee decides',
    field: 'location' as const,
    placeholder: 'Somewhere the attendee will name',
    help: 'Free text agreed with the attendee.',
  },
};

type LocationKind = keyof typeof LOCATION_KINDS;

const schema = z.object({
  type: z.enum(
    Object.keys(LOCATION_KINDS) as [LocationKind, ...LocationKind[]],
  ),
  value: z.string().trim().min(1, 'Enter the location'),
});

type FormValues = z.infer<typeof schema>;

/**
 * Moves a meeting's location WITHOUT moving it in time.
 *
 * Separate from rescheduling on purpose: a reschedule cancels the booking and
 * issues a new uid, notifying everyone that the meeting moved. Switching
 * "Google Meet" to "phone call" should not do that — the meeting is still at
 * the same time with the same people.
 */
export const UpdateLocationDialog = ({
  uid,
  currentLocation,
  open,
  onOpenChange,
}: {
  uid?: string;
  currentLocation?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { updateBookingLocation, pending } = useCalcomBookingActions();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'link', value: '' },
  });

  const kind = form.watch('type');
  const meta = LOCATION_KINDS[kind];

  const onSubmit = async ({ type, value }: FormValues) => {
    if (!uid) return;

    // Built from the kind's own field name — the union discriminates on `type`
    // and each variant expects its value under a different key.
    const ok = await updateBookingLocation(uid, {
      type,
      [LOCATION_KINDS[type].field]: value,
    });

    if (ok) {
      form.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="sm:max-w-md">
        <Dialog.Header>
          <Dialog.Title>Change location</Dialog.Title>
          <Dialog.Description>
            The meeting keeps its time and attendees — only where it happens
            changes. Cal.com notifies everyone.
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {currentLocation && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Currently
                </p>
                <p className="mt-1 truncate text-sm">{currentLocation}</p>
              </div>
            )}

            <Form.Field
              control={form.control}
              name="type"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>Location type</Form.Label>
                  <Select
                    value={field.value}
                    onValueChange={(next) => {
                      field.onChange(next);
                      // The value means something different per type — an
                      // address left in a URL field would be sent as a link.
                      form.setValue('value', '', { shouldValidate: false });
                    }}
                  >
                    <Form.Control>
                      <Select.Trigger>
                        <Select.Value />
                      </Select.Trigger>
                    </Form.Control>
                    <Select.Content>
                      {Object.entries(LOCATION_KINDS).map(([value, cfg]) => (
                        <Select.Item key={value} value={value}>
                          {cfg.label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="value"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{meta.label}</Form.Label>
                  <Form.Control>
                    <Input {...field} placeholder={meta.placeholder} />
                  </Form.Control>
                  <Form.Description>{meta.help}</Form.Description>
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
                {pending ? 'Saving…' : 'Change location'}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
