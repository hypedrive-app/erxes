import { getConfig } from '@/integrations/instagram/commonUtils';
import { verifyMetaWebhookSignature } from '@/integrations/meta/webhookSignature';
import { receiveComment } from '@/integrations/instagram/controller/receiveComment';
import { receiveMessage } from '@/integrations/instagram/controller/receiveMessage';
import { debugError, debugInstagram } from '@/integrations/instagram/debuggers';
import { getSubdomain, isDev } from 'erxes-api-shared/utils';
import { generateModels } from '~/connectionResolvers';

export const instagramGetPost = async (req, res, next) => {
  try {
    debugInstagram(
      `Request to get post data with: ${JSON.stringify(req.query)}`,
    );

    const subdomain = getSubdomain(req);
    const models = await generateModels(subdomain);

    const { erxesApiId } = req.query;

    const post = await models.InstagramPostConversations.findOne({
      erxesApiId,
    });

    return res.json({ ...post });
  } catch (e) {
    next(e);
  }
};

export const instagramGetStatus = async (req, res, next) => {
  try {
    const subdomain = getSubdomain(req);
    const models = await generateModels(subdomain);

    const { integrationId } = req.query;

    const integration = await models.InstagramIntegrations.findOne({
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

export const instagramSubscription = async (req, res, next) => {
  try {
    const subdomain = getSubdomain(req);
    const models = await generateModels(subdomain);

    const INSTAGRAM_VERIFY_TOKEN = await getConfig(
      models,
      'INSTAGRAM_VERIFY_TOKEN',
    );
    if (req.query['hub.mode'] === 'subscribe') {
      if (req.query['hub.verify_token'] === INSTAGRAM_VERIFY_TOKEN) {
        res.send(req.query['hub.challenge']);
      } else {
        // A mismatched token means this request is not the verification
        // handshake Meta's dashboard is running — replying 200 "OK" hid a
        // misconfigured or forged verify attempt behind a response that
        // looked successful. Facebook's/WhatsApp's equivalent already
        // rejects with 403.
        res.sendStatus(403);
      }
    }
  } catch (e) {
    next(e);
  }
};

export const instagramWebhook = async (req, res) => {
  const subdomain = isDev ? 'localhost' : getSubdomain(req);

  debugInstagram(`Received webhook request for subdomain: ${subdomain}`);
  const models = await generateModels(subdomain);

  // Nothing downstream of this point checked whether the request actually
  // came from Meta. Any caller who knew (or guessed) a tenant's subdomain
  // could POST forged messenger/comment/post events straight into a
  // customer's inbox — verified missing before this fix by grepping the
  // whole plugin for any signature/HMAC check and finding none. Rejected
  // before the payload is even read, matching Facebook's/WhatsApp's webhook.
  const INSTAGRAM_APP_SECRET = await getConfig(models, 'INSTAGRAM_APP_SECRET');

  if (
    !verifyMetaWebhookSignature(
      (req as any).rawBody,
      req.headers['x-hub-signature-256'] as string | undefined,
      INSTAGRAM_APP_SECRET,
    )
  ) {
    debugError(
      `Rejected Instagram webhook with invalid signature for subdomain ${subdomain}`,
    );
    return res.sendStatus(403);
  }

  const data = req.body;
  debugInstagram('Received webhook data:' + JSON.stringify(data));

  if (data.object !== 'instagram') {
    return res.sendStatus(200);
  }

  // Acknowledged BEFORE processing, then never written to again below —
  // Meta's own docs say a failed delivery is retried "immediately, then a
  // few more times with decreasing frequency over the next 36 hours", the
  // same guarantee-less redelivery Facebook's/WhatsApp's webhook already
  // acks-first for. This used to send a single `res.send('success')` only
  // after synchronously awaiting every entry/messaging/changes loop below,
  // so slow or failed processing anywhere left Meta waiting past its own
  // timeout and retrying the whole batch. The `mid` unique index added
  // alongside this fix is what makes a resulting redelivery safe to receive
  // now — Meta's own guidance is "your server should handle deduplication
  // in these cases", not that redelivery itself can be prevented.
  res.sendStatus(200);

  for (const entry of data.entry) {
    if (entry.messaging) {
      const messageData = entry.messaging[0];
      if (messageData) {
        try {
          const integration = await models.InstagramIntegrations.findOne({
            instagramPageId: messageData.recipient?.id,
          });
          if (integration) {
            await receiveMessage(models, subdomain, integration, messageData);
          }
        } catch (e) {
          debugError(`Error processing message: ${e.message}`);
        }
      }
    } else if (entry.standby) {
      const standbyData = entry.standby;
      for (const item of standbyData || []) {
        try {
          const integration = await models.InstagramIntegrations.findOne({
            instagramPageId: item.recipient?.id,
          });
          if (!integration) continue;
          await receiveMessage(models, subdomain, integration, item);
        } catch (e) {
          debugError(`Error processing standby: ${e.message}`);
        }
      }
    }

    if (entry.changes) {
      for (const event of entry.changes) {
        // Meta's `verb` on a feed change is `add` for a new comment/post,
        // but also `edit`/`edited` and `delete`/`remove` for the SAME
        // comment or post being changed or taken down — this was read
        // nowhere in this handler, so a deletion or edit flowed into
        // getOrCreateComment exactly like a brand new one and created a
        // ghost record for content that no longer exists. Correctly
        // handling an edit or delete (updating or removing the existing
        // record) is real feature work this fix does not attempt; the
        // safe, correct-today behaviour is to not fabricate a NEW record
        // for content Meta is reporting as gone or changed.
        // https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram/
        const verb = (event.value as { verb?: string })?.verb;

        if (verb && verb !== 'add') {
          debugInstagram(
            `Ignoring feed change with verb "${verb}" (not a new comment/post)`,
          );
          continue;
        }

        if (event.field === 'comments') {
          debugInstagram(
            `Received comment data ${JSON.stringify(event.value)}`,
          );
          try {
            await receiveComment(models, subdomain, event.value, entry.id);
            debugInstagram(`Successfully saved ${JSON.stringify(event.value)}`);
          } catch (e) {
            debugError(`Error processing comment: ${e.message}`);
          }
        }
        // Only `comments` is handled, and that is correct: Instagram has no
        // `feed` field. `feed` is a Facebook *Page* webhook field, and the
        // dead controller that used to branch on it here (archived) was
        // Facebook code copy-pasted onto Instagram — it could never have
        // fired. Meta's Instagram webhook reference lists `comments`,
        // `live_comments`, `mentions`, `messages`, `message_edit`,
        // `message_reactions`, `messaging_seen`, `messaging_postbacks`,
        // `messaging_referral`, `messaging_handover`, `story_insights` and
        // `standby` — no `feed`. Posts surface through `mentions`, which
        // this integration does not subscribe to today.
        // https://developers.facebook.com/docs/graph-api/webhooks/reference/instagram
      }
    }
  }
};
