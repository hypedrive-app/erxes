import { generateModels } from '~/connectionResolvers';
import { handleWhatsappMessage } from '@/integrations/whatsapp/handleWhatsappMessage';
import {
  whatsappCreateIntegration,
  whatsappRemoveIntegration,
  whatsappUpdateIntegration,
} from '@/integrations/whatsapp/helpers';

/**
 * Entry point used by the inbox to dispatch an outgoing message.
 *
 * Mirrors `handleFacebookIntegration`: these are plain in-process functions
 * called directly from the inbox mutations, not queue consumers.
 */
export const handleWhatsappIntegration = async ({ subdomain, data }) => {
  const models = await generateModels(subdomain);
  const { type } = data;

  let response: {
    status: 'success' | 'error';
    data?: any;
    errorMessage?: string;
  } = {
    status: 'success',
  };

  try {
    if (type === 'whatsapp') {
      response.data = await handleWhatsappMessage(models, data);
    }
  } catch (e) {
    response = {
      status: 'error',
      errorMessage: e.message,
    };
  }

  return response;
};

export const whatsappCreateIntegrations = async ({ subdomain, data }) => {
  try {
    return await whatsappCreateIntegration(subdomain, data);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to create integration: ${e.message}`,
    };
  }
};

export const whatsappUpdateIntegrations = async ({
  subdomain,
  data: { integrationId, doc },
}) => {
  try {
    return await whatsappUpdateIntegration(subdomain, integrationId, doc);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to update integration: ${e.message}`,
    };
  }
};

export const whatsappRemoveIntegrations = async ({
  subdomain,
  data: { integrationId },
}) => {
  try {
    return await whatsappRemoveIntegration(subdomain, integrationId);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to remove integration: ${e.message}`,
    };
  }
};

/**
 * Health for the integration settings screen. A missing integration is
 * reported rather than thrown so the UI can show it as disconnected.
 */
export const whatsappStatus = async ({ subdomain, data }) => {
  const models = await generateModels(subdomain);

  const integration = await models.WhatsappIntegrations.findOne({
    erxesApiId: data.integrationId,
  });

  if (!integration) {
    return { status: 'not-found' };
  }

  return {
    status: integration.healthStatus || 'healthy',
    error: integration.error,
  };
};
