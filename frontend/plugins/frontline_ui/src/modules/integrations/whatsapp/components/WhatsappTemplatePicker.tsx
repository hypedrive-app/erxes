import { zodResolver } from '@hookform/resolvers/zod';
import { IconRefresh, IconSend } from '@tabler/icons-react';
import {
  Button,
  Form,
  Input,
  Select,
  Spinner,
  toast,
} from 'erxes-ui';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useConversationContext } from '@/inbox/conversations/hooks/useConversationContext';
import { useConversationMessageAdd } from '@/inbox/conversations/conversation-detail/hooks/useConversationMessageAdd';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';
import { IWhatsappTemplate } from '../types/WhatsappTemplate';
import {
  buildTemplateDispatch,
  buildTemplatePreview,
  getBodyPlaceholders,
  getHeaderPlaceholders,
} from '../utils/whatsappTemplateUtils';

/**
 * Values are a flat pair of arrays so the resolver can size itself to the
 * selected template: a template with two body placeholders must collect exactly
 * two non-empty values, and Meta rejects any other count outright.
 */
const TEMPLATE_FORM_SCHEMA = z.object({
  templateId: z.string().min(1, 'Select a template'),
  headerValues: z.array(z.string()),
  bodyValues: z.array(z.string()),
});

type WhatsappTemplateFormValues = z.infer<typeof TEMPLATE_FORM_SCHEMA>;

const buildSchema = (template: IWhatsappTemplate | undefined) => {
  const headerCount = getHeaderPlaceholders(template).length;
  const bodyCount = getBodyPlaceholders(template).length;

  const required = (message: string) => z.string().trim().min(1, message);

  return TEMPLATE_FORM_SCHEMA.extend({
    headerValues: z
      .array(required('Required'))
      .length(headerCount, 'Fill every header variable'),
    bodyValues: z
      .array(required('Required'))
      .length(bodyCount, 'Fill every message variable'),
  });
};

export const WhatsappTemplatePicker = () => {
  const { t } = useTranslation('frontline');
  const { _id: conversationId } = useConversationContext();
  const { templates, loading, error, refetch } =
    useWhatsappTemplates(conversationId);
  const { addConversationMessage, loading: sending } =
    useConversationMessageAdd();

  const form = useForm<WhatsappTemplateFormValues>({
    defaultValues: { templateId: '', headerValues: [], bodyValues: [] },
    resolver: (values, context, options) => {
      const selected = templates.find((item) => item.id === values.templateId);

      return zodResolver(buildSchema(selected))(values, context, options);
    },
  });

  const templateId = form.watch('templateId');
  const headerValues = form.watch('headerValues');
  const bodyValues = form.watch('bodyValues');

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === templateId),
    [templates, templateId],
  );

  const headerPlaceholders = getHeaderPlaceholders(selectedTemplate);
  const bodyPlaceholders = getBodyPlaceholders(selectedTemplate);

  // Re-size the value arrays whenever the agent picks a different template, so
  // a previous template's answers cannot be submitted against the new one.
  useEffect(() => {
    form.setValue(
      'headerValues',
      Array.from({ length: headerPlaceholders.length }, () => ''),
    );
    form.setValue(
      'bodyValues',
      Array.from({ length: bodyPlaceholders.length }, () => ''),
    );
  }, [templateId, headerPlaceholders.length, bodyPlaceholders.length, form]);

  const preview = selectedTemplate
    ? buildTemplatePreview(
        selectedTemplate,
        headerValues || [],
        bodyValues || [],
      )
    : '';

  const onSubmit = (values: WhatsappTemplateFormValues) => {
    if (!selectedTemplate || !conversationId) {
      return;
    }

    const dispatch = buildTemplateDispatch(
      selectedTemplate,
      values.headerValues,
      values.bodyValues,
    );

    addConversationMessage({
      variables: {
        conversationId,
        // The resolved copy is stored as the message body so the thread shows
        // what the customer actually received rather than an empty bubble.
        content: buildTemplatePreview(
          selectedTemplate,
          values.headerValues,
          values.bodyValues,
        ),
        internal: false,
        extraInfo: { whatsappTemplate: dispatch },
      },
      onCompleted: () => {
        toast({ title: t('whatsapp-template-sent'), variant: 'default' });
        form.reset({ templateId: '', headerValues: [], bodyValues: [] });
      },
      onError: (err) =>
        toast({
          title: t('whatsapp-template-send-failed', { message: err.message }),
          variant: 'destructive',
        }),
      refetchQueries: ['Conversations', 'ConversationMessages'],
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
        <Spinner size="sm" />
        {t('whatsapp-templates-loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t('whatsapp-templates-load-failed')}
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          <IconRefresh />
          {t('whatsapp-templates-retry')}
        </Button>
      </div>
    );
  }

  if (!templates.length) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm font-medium">{t('whatsapp-templates-empty')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('whatsapp-templates-empty-description')}
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <Form.Field
          control={form.control}
          name="templateId"
          render={({ field }) => (
            <Form.Item>
              <Form.Label>{t('whatsapp-template')}</Form.Label>
              <Form.Control>
                <Select value={field.value} onValueChange={field.onChange}>
                  <Select.Trigger>
                    <Select.Value
                      placeholder={t('whatsapp-template-placeholder')}
                    />
                  </Select.Trigger>
                  <Select.Content>
                    {templates.map((template) => (
                      <Select.Item key={template.id} value={template.id}>
                        {template.name} ({template.language})
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Form.Control>
              <Form.Description>
                {t('whatsapp-template-description')}
              </Form.Description>
              <Form.Message />
            </Form.Item>
          )}
        />

        {headerPlaceholders.map((placeholder, index) => (
          <Form.Field
            key={`header-${placeholder}`}
            control={form.control}
            name={`headerValues.${index}` as const}
            render={({ field }) => (
              <Form.Item>
                <Form.Label>
                  {t('whatsapp-template-header-variable', {
                    index: placeholder,
                  })}
                </Form.Label>
                <Form.Control>
                  <Input {...field} autoComplete="off" />
                </Form.Control>
                <Form.Message />
              </Form.Item>
            )}
          />
        ))}

        {bodyPlaceholders.map((placeholder, index) => (
          <Form.Field
            key={`body-${placeholder}`}
            control={form.control}
            name={`bodyValues.${index}` as const}
            render={({ field }) => (
              <Form.Item>
                <Form.Label>
                  {t('whatsapp-template-body-variable', { index: placeholder })}
                </Form.Label>
                <Form.Control>
                  <Input {...field} autoComplete="off" />
                </Form.Control>
                <Form.Message />
              </Form.Item>
            )}
          />
        ))}

        {!!preview && (
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {t('whatsapp-template-preview')}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{preview}</p>
          </div>
        )}

        <Button type="submit" disabled={sending || !selectedTemplate}>
          <IconSend />
          {t('whatsapp-template-send')}
        </Button>
      </form>
    </Form>
  );
};
