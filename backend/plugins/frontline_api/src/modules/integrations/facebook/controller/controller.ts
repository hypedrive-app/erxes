import { IFacebookIntegrationDocument } from '@/integrations/facebook/@types/integrations';
import { verifyMetaWebhookSignature } from '@/integrations/meta/webhookSignature';
import { getConfig } from '@/integrations/facebook/commonUtils';
import {
  FACEBOOK_POST_TYPES,
  INTEGRATION_KINDS,
} from '@/integrations/facebook/constants';
import { receiveComment } from '@/integrations/facebook/controller/receiveComment';
import { receiveMessage } from '@/integrations/facebook/controller/receiveMessage';
import { receivePost } from '@/integrations/facebook/controller/receivePost';
import { debugError, debugFacebook } from '@/integrations/facebook/debuggers';
import {
  checkIsAdsOpenThread,
  getPageAccessTokenFromMap,
} from '@/integrations/facebook/utils';
import { getSubdomain, isDev } from 'erxes-api-shared/utils';
import { generateModels, IModels } from '~/connectionResolvers';

export const facebookGetPost = async (req, res, next) => {
  try {
    debugFacebook(
      `Request to get post data with: ${JSON.stringify(req.query)}`,
    );

    const subdomain = getSubdomain(req);
    const models = await generateModels(subdomain);

    const { erxesApiId } = req.query;

    const post = await models.FacebookPostConversations.findOne({ erxesApiId });

    return res.json({ ...post });
  } catch (e) {
    next(e);
  }
};

export const facebookGetStatus = async (req, res, next) => {
  try {
    const subdomain = getSubdomain(req);
    const models = await generateModels(subdomain);

    const { integrationId } = req.query;

    const integration = await models.FacebookIntegrations.findOne({
      erxesApiId: integrationId,
    });

    let result = {
      status: 'healthy',
    } as any;

    if (integration) {
      result = {
        status: integration.healthStatus || 'healthy',
        error: integration.error,
      };
    }

    return res.send(result);
  } catch (e) {
    next(e);
  }
};

const accessTokensByPageId = {};
export const facebookSubscription = async (req, res, next) => {
  try {
    const subdomain = getSubdomain(req);
    const models = await generateModels(subdomain);

    const FACEBOOK_VERIFY_TOKEN = await getConfig(
      models,
      'FACEBOOK_VERIFY_TOKEN',
    );

    // when the endpoint is registered as a webhook, it must echo back
    // the 'hub.challenge' value it receives in the query arguments
    if (req.query['hub.mode'] === 'subscribe') {
      if (req.query['hub.verify_token'] === FACEBOOK_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
      } else {
        // A mismatched token means this request is not the verification
        // handshake Meta's dashboard is running — replying 200 "OK" hid a
        // misconfigured or forged verify attempt behind a response that
        // looked successful. WhatsApp's equivalent already rejects with 403.
        res.sendStatus(403);
      }
    }
  } catch (e) {
    next(e);
  }
};
export const facebookWebhook = async (req, res, next) => {
  const subdomain = isDev ? 'localhost' : getSubdomain(req);

  debugFacebook(`Received webhook request for subdomain: ${subdomain}`);

  const models = await generateModels(subdomain);

  // Nothing downstream of this point checked whether the request actually
  // came from Meta. Any caller who knew (or guessed) a tenant's subdomain
  // could POST forged messenger/comment/post events straight into a
  // customer's inbox — verified missing before this fix by grepping the
  // whole plugin for any signature/HMAC check and finding none. Rejected
  // before the payload is even parsed for entries, matching how WhatsApp's
  // webhook rejects an unverified request before touching its body.
  const FACEBOOK_APP_SECRET = await getConfig(models, 'FACEBOOK_APP_SECRET');

  if (
    !verifyMetaWebhookSignature(
      (req as any).rawBody,
      req.headers['x-hub-signature-256'] as string | undefined,
      FACEBOOK_APP_SECRET,
    )
  ) {
    debugError(
      `Rejected Facebook webhook with invalid signature for subdomain ${subdomain}`,
    );
    return res.sendStatus(403);
  }

  const data = req.body;
  if (data.object !== 'page' && !checkIsAdsOpenThread(data?.entry)) {
    return res.sendStatus(200);
  }

  // Acknowledged BEFORE processing, then never written to again below —
  // Meta's own docs say a failed delivery is retried "immediately, then a
  // few more times with decreasing frequency over the next 36 hours", the
  // same guarantee-less redelivery WhatsApp's webhook already acks-first
  // for. This used to respond from up to four different places nested
  // inside the entry/changes loops (a `res.end('success')` per branch, a
  // `res.status(200)` inside `processMessagingEvent`), which meant slow or
  // failed processing anywhere left Meta waiting past its own timeout and
  // retrying the whole batch — and a payload with more than one entry could
  // even attempt a SECOND res.send after the first had already gone out,
  // which throws (`ERR_HTTP_HEADERS_SENT`). The `mid` unique index added
  // alongside this fix is what makes a resulting redelivery safe to receive
  // now — Meta's own guidance is "your server should handle deduplication
  // in these cases", not that redelivery itself can be prevented.
  res.sendStatus(200);

  for (const entry of data.entry) {
    // receive chat
    try {
      if (entry.messaging) {
        await processMessagingEvent(
          entry,
          models,
          subdomain,
          accessTokensByPageId,
        );
      }
      if (entry.standby) {
        const activities = await processStandbyEvents(entry, models);
        for (const { activity, integration } of activities) {
          await receiveMessage(models, subdomain, integration, activity);
        }
      }
    } catch (error) {
      debugFacebook(`Error processing entry: ${error.message}`);
    }

    // receive post and comment
    if (entry.changes) {
      for (const event of entry.changes) {
        // Meta's `verb` on a feed change is `add` for a new comment/post,
        // but also `edit`/`edited` and `delete`/`remove` for the SAME
        // comment or post being changed or taken down — this was read
        // nowhere in this handler, so a deletion or edit flowed into
        // getOrCreateComment/getOrCreatePost exactly like a brand new one
        // and created a ghost record for content that no longer exists.
        // Correctly handling an edit or delete (updating or removing the
        // existing record) is real feature work this fix does not attempt;
        // the safe, correct-today behaviour is to not fabricate a NEW
        // record for content Meta is reporting as gone or changed.
        // https://developers.facebook.com/docs/graph-api/webhooks/reference/page/
        const verb = (event.value as { verb?: string }).verb;

        if (verb && verb !== 'add') {
          debugFacebook(
            `Ignoring feed change with verb "${verb}" (not a new comment/post)`,
          );
          continue;
        }

        if (event.value.item === 'comment') {
          debugFacebook(`Received comment data ${JSON.stringify(event.value)}`);
          try {
            await receiveComment(models, subdomain, event.value, entry.id);
            debugFacebook(`Successfully saved  ${JSON.stringify(event.value)}`);
          } catch (e) {
            debugError(`Error processing comment: ${e.message}`);
          }
          continue;
        }

        if (FACEBOOK_POST_TYPES.includes(event.value.item)) {
          try {
            debugFacebook(`Received post data ${JSON.stringify(event.value)}`);
            await receivePost(models, subdomain, event.value, entry.id);
            debugFacebook(
              `Successfully saved post ${JSON.stringify(event.value)}`,
            );
          } catch (e) {
            debugError(`Error processing post: ${e.message}`);
          }
        }
      }
    }
  }
};

export async function processMessagingEvent(
  entry: any,
  models: IModels,
  subdomain: string,
  accessTokensByPageId: Record<string, string>,
) {
  debugFacebook(`Received messenger data: ${JSON.stringify(entry)}`);

  try {
    const messagingEvents = Array.isArray(entry.messaging)
      ? entry.messaging
      : [];

    if (messagingEvents.length === 0) {
      debugFacebook('No messaging events found in entry.');
      return;
    }

    for (const activity of messagingEvents) {
      if (!activity?.recipient?.id) {
        debugFacebook('Skipping activity with missing recipient ID.');
        continue;
      }

      const pageId = activity.recipient.id;

      // Find the related Facebook integration
      const integration = await models.FacebookIntegrations.getIntegration({
        $and: [
          { facebookPageIds: { $in: [pageId] } },
          { kind: INTEGRATION_KINDS.MESSENGER },
        ],
      });

      if (!integration) {
        debugFacebook(`No integration found for pageId: ${pageId}`);
        continue;
      }

      const facebookAccounts = await models.FacebookAccounts.getAccount({
        _id: integration.accountId,
      });

      if (!facebookAccounts) {
        debugFacebook(
          `No Facebook account found for accountId: ${integration.accountId}`,
        );
        continue;
      }

      const { facebookPageTokensMap = {} } = integration;
      try {
        accessTokensByPageId[pageId] = getPageAccessTokenFromMap(
          pageId,
          facebookPageTokensMap,
        );
      } catch (e) {
        debugFacebook(`Error getting page access token: ${e.message}`);
        continue;
      }

      const activityData = {
        channelId: 'facebook',
        timestamp: new Date(activity.timestamp),
        conversation: {
          id: activity.sender?.id || '',
        },
        from: {
          id: activity.sender?.id || '',
          name: activity.sender?.name || activity.sender?.id || '',
        },
        recipient: {
          id: activity.recipient?.id || '',
          name: activity.recipient?.name || activity.recipient?.id || '',
        },
        channelData: activity,
        type: 'message',
        text: activity.message?.text || '',
      };
      debugFacebook(`Processing activity: ${JSON.stringify(activityData)}`);

      await receiveMessage(models, subdomain, integration, activityData);
    }
  } catch (e) {
    debugFacebook(`Failed to process messaging event: ${(e as Error).message}`);
  }
}

export async function processStandbyEvents(data: any, models: IModels) {
  const activities: {
    activity: any;
    integration: IFacebookIntegrationDocument;
  }[] = [];
  if (!data.standby || !Array.isArray(data.standby)) {
    debugFacebook('No standby events found or standby is not an array');
    return activities;
  }
  for (const standbyEvent of data.standby) {
    try {
      if (
        !standbyEvent.recipient?.id ||
        !standbyEvent.sender?.id ||
        !standbyEvent.timestamp
      ) {
        debugFacebook('Invalid standby event: missing required fields');
        continue; // Skip invalid event
      }

      const integration = await models.FacebookIntegrations.getIntegration({
        $and: [
          { facebookPageIds: { $in: [standbyEvent.recipient.id] } },
          { kind: INTEGRATION_KINDS.MESSENGER },
        ],
      });

      if (!integration) {
        debugFacebook(
          `Integration not found for pageId: ${standbyEvent.recipient.id}`,
        );
        continue;
      }

      const activity: any = {
        channelId: 'facebook',
        timestamp: new Date(standbyEvent.timestamp),
        conversation: {
          id: standbyEvent.sender.id,
        },
        from: {
          id: standbyEvent.sender.id,
          name: standbyEvent.sender.id,
        },
        recipient: {
          id: standbyEvent.recipient.id,
          name: standbyEvent.recipient.id,
        },
        channelData: standbyEvent,
        type: 'message',
        text: standbyEvent.message?.text || '',
      };

      activities.push({ activity, integration });
    } catch (error) {
      debugFacebook(`Error processing standby event: ${error.message}`);
    }
  }

  return activities;
}
