import { generateModels } from '~/connectionResolvers';
import {
  handlePlivoClickToCall,
  handlePlivoHangup,
} from '@/integrations/plivo/handlePlivoCall';
import {
  plivoCreateIntegration,
  plivoRemoveIntegration,
  plivoRepairIntegration,
  plivoUpdateIntegration,
} from '@/integrations/plivo/helpers';

/**
 * Entry point used by the inbox to act on a call.
 *
 * Mirrors `handleWhatsappIntegration`: these are plain in-process functions
 * called directly from the inbox mutations, not queue consumers.
 */
export const handlePlivoIntegration = async ({ subdomain, data }) => {
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
    if (type === 'plivo-call') {
      response.data = await handlePlivoClickToCall(models, subdomain, data);
    }

    if (type === 'plivo-hangup') {
      response.data = await handlePlivoHangup(models, data);
    }
  } catch (e) {
    response = {
      status: 'error',
      errorMessage: e.message,
    };
  }

  return response;
};

export const plivoCreateIntegrations = async ({ subdomain, data }) => {
  try {
    return await plivoCreateIntegration(subdomain, data);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to create integration: ${e.message}`,
    };
  }
};

/**
 * `doc` is the envelope `sendUpdateIntegration` builds, not the config itself —
 * the JSON string the update expects is `doc.data`. Passing `doc` straight
 * through reached `parseConfig` as an object and failed every update with
 * `Invalid payload format: "[object Object]" is not valid JSON`, so a Plivo
 * integration's routing settings could not be changed once it existed.
 */
export const plivoUpdateIntegrations = async ({
  subdomain,
  data: { integrationId, doc },
}): Promise<{ status: string; errorMessage?: string }> => {
  try {
    return await plivoUpdateIntegration(subdomain, integrationId, doc?.data);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to update integration: ${e.message}`,
    };
  }
};

export const plivoRemoveIntegrations = async ({
  subdomain,
  data: { integrationId },
}) => {
  try {
    return await plivoRemoveIntegration(subdomain, integrationId);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to remove integration: ${e.message}`,
    };
  }
};

/**
 * Re-checks stored credentials and clears the error state if they work again.
 *
 * An auth token being rotated is the usual way a Plivo integration breaks, so
 * "repair" here means revalidating rather than re-subscribing to anything.
 */
export const plivoRepairIntegrations = async ({
  subdomain,
  data: { integrationId },
}) => {
  try {
    return await plivoRepairIntegration(subdomain, integrationId);
  } catch (e) {
    return {
      status: 'error',
      errorMessage: `Failed to repair integration: ${e.message}`,
    };
  }
};

/**
 * Health for the integration settings screen. A missing integration is
 * reported rather than thrown so the UI can show it as disconnected.
 */
export const plivoStatus = async ({
  subdomain,
  data: { integrationId },
}: {
  subdomain: string;
  data: { integrationId: string };
}): Promise<{ data: any; status: string }> => {
  const models = await generateModels(subdomain);

  const integration = await models.PlivoIntegrations.findOne({
    erxesApiId: integrationId,
  });

  if (!integration) {
    return { status: 'success', data: { status: 'not-found' } };
  }

  return {
    status: 'success',
    data: {
      status: integration.healthStatus || 'healthy',
      error: integration.error,
    },
  };
};
