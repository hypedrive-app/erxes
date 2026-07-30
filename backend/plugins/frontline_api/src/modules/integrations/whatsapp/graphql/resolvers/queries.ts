import { IContext } from '~/connectionResolvers';
import { listWhatsappTemplates } from '@/integrations/whatsapp/utils';
import { IWhatsappTemplate } from '@/integrations/whatsapp/@types';

export const whatsappQueries = {
  /**
   * Approved templates available on the conversation's WhatsApp number.
   *
   * Keyed by conversation rather than integration so the composer can ask for
   * templates with what it already has, and so the access token and WABA id
   * stay on the server — neither is ever exposed to the client.
   *
   * A number connected without a WABA id cannot list templates at all (the id
   * is optional on the integration), which is reported as an empty list rather
   * than an error so the UI shows its empty state instead of a failure.
   */
  whatsappTemplates: async (
    _root: undefined,
    { conversationId }: { conversationId: string },
    { models }: IContext,
  ): Promise<IWhatsappTemplate[]> => {
    const conversation = await models.WhatsappConversations.getConversation({
      erxesApiId: conversationId,
    });

    const integration = await models.WhatsappIntegrations.getIntegration({
      erxesApiId: conversation.integrationId,
    });

    if (!integration.whatsappBusinessAccountId) {
      return [];
    }

    return listWhatsappTemplates({
      accessToken: integration.accessToken,
      whatsappBusinessAccountId: integration.whatsappBusinessAccountId,
    });
  },
};
