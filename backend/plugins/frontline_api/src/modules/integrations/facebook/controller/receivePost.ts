import { IModels } from '~/connectionResolvers';
import { IPostParams } from '@/integrations/facebook/@types/utils';
import { INTEGRATION_KINDS } from '@/integrations/facebook/constants';
import {
  getOrCreateCustomer,
  getOrCreatePost,
} from '@/integrations/facebook/controller/store';
export const receivePost = async (
  models: IModels,
  subdomain: string,
  params: IPostParams,
  pageId: string,
) => {
  // `$in` requires an array operand — MongoDB has rejected a bare scalar here
  // with "BadValue $in needs an array" since server version 2.6, so this
  // query threw on every single webhook delivery rather than matching
  // anything. `receiveComment.ts`/`store.ts` had the identical bug;
  // `controller.ts`'s own `processMessagingEvent` already uses the correct
  // `$in: [pageId]` form.
  const integration = await models.FacebookIntegrations.findOne({
    $and: [
      { facebookPageIds: { $in: [pageId] } },
      { kind: INTEGRATION_KINDS.POST },
    ],
  });

  if (!integration) {
    throw new Error('Integration not found');
  }

  const userId = params.from.id;

  const customer = await getOrCreateCustomer(
    models,
    subdomain,
    pageId,
    userId,
    INTEGRATION_KINDS.POST,
  );
  if (!customer) {
    throw new Error('Customer not found');
  }
  await getOrCreatePost(models, subdomain, params, pageId, userId, integration);
};
