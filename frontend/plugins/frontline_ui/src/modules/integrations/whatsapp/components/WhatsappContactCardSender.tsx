import { IconAddressBook, IconSend } from '@tabler/icons-react';
import { Button, Dialog, Form, Spinner, toast } from 'erxes-ui';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { SelectCustomer, useCustomerDetail } from 'ui-modules';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { useConversationContext } from '@/inbox/conversations/hooks/useConversationContext';
import { useConversationMessageAdd } from '@/inbox/conversations/conversation-detail/hooks/useConversationMessageAdd';

const schema = z.object({
  customerId: z.string().min(1, 'Pick a contact to share'),
});

type TFormValues = z.infer<typeof schema>;

/**
 * Shares one of our own contacts as a WhatsApp contact card.
 *
 * The card is built from the CRM record rather than typed: the point of
 * sharing a contact is that the recipient can tap to call or save it, and
 * hand-keying a number into a form is both slower and a place to get it wrong.
 *
 * Free-form, so it is mounted inside the open 24 hour window — Meta rejects a
 * contacts message once the window has closed.
 */
export const WhatsappContactCardSender = () => {
  const { t } = useTranslation('frontline');
  const { _id: conversationId } = useConversationContext();
  const { addConversationMessage, loading: sending } =
    useConversationMessageAdd();
  const [open, setOpen] = useState(false);

  const form = useForm<TFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { customerId: '' },
  });

  const customerId = form.watch('customerId');

  const { customerDetail, loading } = useCustomerDetail({
    variables: { _id: customerId },
    skip: !customerId,
  });

  const fullName =
    [customerDetail?.firstName, customerDetail?.middleName, customerDetail?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim() ||
    customerDetail?.primaryEmail ||
    customerDetail?.primaryPhone ||
    '';

  const onSubmit = () => {
    if (!customerDetail) {
      return;
    }

    // Meta requires `formatted_name` on every card and rejects the whole
    // message without it, so a contact with no name at all cannot be shared.
    if (!fullName) {
      toast({
        title: t('whatsapp-contact-card-unnamed'),
        variant: 'destructive',
      });
      return;
    }

    const phones = (customerDetail.phones?.length
      ? customerDetail.phones
      : [customerDetail.primaryPhone]
    ).filter(Boolean) as string[];

    const emails = (customerDetail.emails?.length
      ? customerDetail.emails
      : [customerDetail.primaryEmail]
    ).filter(Boolean) as string[];

    addConversationMessage({
      variables: {
        conversationId,
        // The shared person's name is what the thread shows; a blank bubble
        // would leave an agent unable to tell which card they sent.
        content: fullName,
        internal: false,
        extraInfo: {
          whatsappContacts: [
            {
              name: {
                formatted_name: fullName,
                ...(customerDetail.firstName
                  ? { first_name: customerDetail.firstName }
                  : {}),
                ...(customerDetail.lastName
                  ? { last_name: customerDetail.lastName }
                  : {}),
              },
              ...(phones.length
                ? { phones: phones.map((phone) => ({ phone })) }
                : {}),
              ...(emails.length
                ? { emails: emails.map((email) => ({ email })) }
                : {}),
              ...(customerDetail.companies?.[0]?.primaryName ||
              customerDetail.position ||
              customerDetail.department
                ? {
                    org: {
                      ...(customerDetail.companies?.[0]?.primaryName
                        ? { company: customerDetail.companies[0].primaryName }
                        : {}),
                      ...(customerDetail.position
                        ? { title: customerDetail.position }
                        : {}),
                      ...(customerDetail.department
                        ? { department: customerDetail.department }
                        : {}),
                    },
                  }
                : {}),
            },
          ],
        },
      },
      onCompleted: () => {
        toast({ title: t('whatsapp-contact-card-sent') });
        form.reset({ customerId: '' });
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
          aria-label={t('whatsapp-contact-card-open')}
          className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <IconAddressBook className="h-4 w-4" />
        </Button>
      </Dialog.Trigger>

      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>{t('whatsapp-contact-card-title')}</Dialog.Title>
          <Dialog.Description>
            {t('whatsapp-contact-card-description')}
          </Dialog.Description>
        </Dialog.Header>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <Form.Field
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <Form.Item>
                  <Form.Label>{t('whatsapp-contact-card-contact')}</Form.Label>
                  <SelectCustomer.FormItem
                    mode="single"
                    value={field.value}
                    onValueChange={(value) =>
                      field.onChange(Array.isArray(value) ? value[0] : value)
                    }
                  />
                  <Form.Message />
                </Form.Item>
              )}
            />

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner size="sm" />
                {t('whatsapp-contact-card-loading')}
              </div>
            )}

            {/* What the recipient will actually receive, so an agent can see
                a card is missing its number BEFORE sending it. */}
            {!loading && !!customerDetail && (
              <div className="rounded-lg border bg-background p-3 text-sm">
                <p className="font-medium">
                  {fullName || t('whatsapp-contact-card-unnamed-preview')}
                </p>
                {!!customerDetail.primaryPhone && (
                  <p className="text-muted-foreground">
                    {customerDetail.primaryPhone}
                  </p>
                )}
                {!!customerDetail.primaryEmail && (
                  <p className="text-muted-foreground">
                    {customerDetail.primaryEmail}
                  </p>
                )}
                {!customerDetail.primaryPhone &&
                  !customerDetail.primaryEmail && (
                    <p className="text-muted-foreground">
                      {t('whatsapp-contact-card-no-details')}
                    </p>
                  )}
              </div>
            )}

            <Dialog.Footer>
              <Button type="submit" disabled={sending || loading || !customerId}>
                {sending ? <Spinner size="sm" /> : <IconSend />}
                {t('whatsapp-contact-card-send')}
              </Button>
            </Dialog.Footer>
          </form>
        </Form>
      </Dialog.Content>
    </Dialog>
  );
};
