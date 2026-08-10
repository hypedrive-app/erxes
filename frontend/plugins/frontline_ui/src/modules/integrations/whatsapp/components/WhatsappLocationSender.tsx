import { zodResolver } from '@hookform/resolvers/zod';
import { IconMapPin, IconSend } from '@tabler/icons-react';
import { Button, Dialog, Form, Input, Spinner, toast } from 'erxes-ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { useConversationContext } from '@/inbox/conversations/hooks/useConversationContext';
import { useConversationMessageAdd } from '@/inbox/conversations/conversation-detail/hooks/useConversationMessageAdd';
import { parseLocation } from '../utils/parseLocation';

const schema = z.object({
  // Validated through the same parser the submit uses, so the field cannot
  // pass here and then fail to produce coordinates below.
  place: z
    .string()
    .trim()
    .min(1, 'Paste a maps link or a latitude, longitude pair')
    .refine((value) => parseLocation(value) !== null, {
      message:
        'No coordinates in that. Paste a maps link with an @lat,lng or a pair like 19.076, 72.877',
    }),
  name: z.string().trim().max(1000).optional(),
  address: z.string().trim().max(1000).optional(),
});

type TFormValues = z.infer<typeof schema>;

/**
 * Sends a pin to the contact.
 *
 * Free-form, so it is mounted inside the open 24 hour window like the reply
 * builder — Meta rejects a location message once the window has closed.
 */
export const WhatsappLocationSender = () => {
  const { t } = useTranslation('frontline');
  const { _id: conversationId } = useConversationContext();
  const { addConversationMessage, loading: sending } =
    useConversationMessageAdd();
  const [open, setOpen] = useState(false);

  const form = useForm<TFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { place: '', name: '', address: '' },
  });

  const onSubmit = (values: TFormValues) => {
    const coordinates = parseLocation(values.place);

    if (!coordinates) {
      return;
    }

    addConversationMessage({
      variables: {
        conversationId,
        // The thread shows the place by name where one was given, and by
        // coordinates otherwise — a blank bubble would leave an agent unable
        // to tell which pin they sent.
        content:
          values.name ||
          values.address ||
          `${coordinates.latitude}, ${coordinates.longitude}`,
        internal: false,
        extraInfo: {
          whatsappLocation: {
            ...coordinates,
            ...(values.name ? { name: values.name } : {}),
            ...(values.address ? { address: values.address } : {}),
          },
        },
      },
      onCompleted: () => {
        toast({ title: t('whatsapp-location-sent') });
        form.reset({ place: '', name: '', address: '' });
        setOpen(false);
      },
      onError: (error) =>
        toast({ title: error.message, variant: 'destructive' }),
      refetchQueries: ['Conversations', 'ConversationMessages'],
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('whatsapp-location-open')}
          className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <IconMapPin className="h-4 w-4" />
        </Button>
      </Dialog.Trigger>

      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>{t('whatsapp-location-title')}</Dialog.Title>
          <Dialog.Description>
            {t('whatsapp-location-description')}
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <Form.Field
              control={form.control}
              name="place"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t('whatsapp-location-place')}</Form.Label>
                  <Form.Control>
                    <Input
                      {...field}
                      autoComplete="off"
                      placeholder={t('whatsapp-location-place-placeholder')}
                    />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="name"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t('whatsapp-location-name')}</Form.Label>
                  <Form.Control>
                    <Input {...field} autoComplete="off" />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Form.Field
              control={form.control}
              name="address"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t('whatsapp-location-address')}</Form.Label>
                  <Form.Control>
                    <Input {...field} autoComplete="off" />
                  </Form.Control>
                  <Form.Message />
                </Form.Item>
              )}
            />

            <Dialog.Footer>
              <Button type="submit" disabled={sending}>
                {sending ? <Spinner size="sm" /> : <IconSend />}
                {t('whatsapp-location-send')}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
