import { randomBytes } from 'crypto';

import {
  createCalcomWebhook,
  listCalcomWebhooks,
  updateCalcomWebhook,
} from '@/bookings/calcomApi';
import { getCalcomConfig } from '@/bookings/config';
import { HANDLED_TRIGGERS } from '@/bookings/webhook/mapPayload';
import { IModels } from '~/connectionResolvers';

/**
 * Provisions and repairs this plugin's Cal.com webhook subscription.
 *
 * Setup used to require an operator to create the webhook by hand in Cal.com,
 * copy its signing secret, and paste that into erxes — three manual steps where
 * a single typo produces a silent failure: every delivery fails signature
 * verification, answers 401, and Cal.com eventually disables the subscriber.
 * Nothing surfaces except "no bookings appear".
 *
 * The secret is always GENERATED HERE and pushed to Cal.com, never read back.
 * UserWebhookOutputDto lists `secret` as a property but NOT in its required
 * fields, so the API does not contractually guarantee it round-trips on read —
 * a design that tried to recover an operator-set secret would work on some
 * deployments and silently fail on others.
 */

const SIGNING_SECRET_BYTES = 24;

export type WebhookHealth = {
  status: 'ok' | 'missing' | 'misconfigured' | 'unconfigured';
  webhookId?: string;
  subscriberUrl?: string;
  /** Present only for `misconfigured`, naming what actually differs. */
  problems?: string[];
};

/**
 * Where Cal.com should deliver.
 *
 * Derived from the API domain rather than stored, so it cannot drift from the
 * route that actually serves it. The `/pl:calcom` prefix is how the gateway
 * routes to a plugin's express router.
 */
export const webhookSubscriberUrl = (apiDomain: string) =>
  `${apiDomain.replace(/\/+$/, '')}/pl:calcom/calcom/webhook`;

const sameTriggers = (a: string[] = [], b: string[] = []) => {
  if (a.length !== b.length) return false;

  const sorted = [...a].sort();
  return [...b].sort().every((t, i) => sorted[i] === t);
};

/**
 * Reports whether the subscription is present and correct.
 *
 * Matched on subscriberUrl rather than on a stored id: an operator may have
 * created the webhook by hand before this existed, and adopting theirs is
 * better than creating a duplicate that delivers everything twice.
 */
export const checkWebhookHealth = async (
  models: IModels,
  apiDomain: string,
): Promise<WebhookHealth> => {
  const apiKey = await getCalcomConfig(models, 'CALCOM_API_KEY');

  if (!apiKey) {
    return { status: 'unconfigured' };
  }

  const expectedUrl = webhookSubscriberUrl(apiDomain);
  const result = await listCalcomWebhooks(models, { take: 100 });
  const all: any[] = Array.isArray(result) ? result : result?.data || [];

  const mine = all.find((w) => w?.subscriberUrl === expectedUrl);

  if (!mine) {
    return { status: 'missing', subscriberUrl: expectedUrl };
  }

  const problems: string[] = [];

  if (!mine.active) problems.push('subscription is inactive');

  if (!sameTriggers(mine.triggers, [...HANDLED_TRIGGERS])) {
    problems.push('subscribed events do not match what this plugin handles');
  }

  return {
    status: problems.length ? 'misconfigured' : 'ok',
    webhookId: mine.id,
    subscriberUrl: expectedUrl,
    ...(problems.length ? { problems } : {}),
  };
};

/**
 * Creates the subscription, or repairs an existing one, and stores the secret.
 *
 * Always rotates the signing secret. That is deliberate: this runs when someone
 * has asked for the integration to be fixed, and the most common reason it is
 * broken is that the two sides disagree about the secret. Setting both ends
 * from one freshly generated value is the only way to guarantee they agree —
 * reading Cal.com's copy is not reliable (see the note at the top).
 *
 * Deliveries signed with the previous secret are rejected for the moment
 * between Cal.com accepting the new one and the config write landing. Cal.com
 * retries non-2xx deliveries, so those are redelivered rather than lost.
 */
export const provisionWebhook = async (
  models: IModels,
  apiDomain: string,
): Promise<WebhookHealth> => {
  const subscriberUrl = webhookSubscriberUrl(apiDomain);
  const secret = randomBytes(SIGNING_SECRET_BYTES).toString('hex');
  const triggers = [...HANDLED_TRIGGERS];

  const existing = await checkWebhookHealth(models, apiDomain);

  if (existing.status === 'unconfigured') {
    throw new Error(
      'Set the Cal.com API key first — provisioning a webhook needs it.',
    );
  }

  let webhookId = existing.webhookId;

  if (webhookId) {
    await updateCalcomWebhook(models, webhookId, {
      subscriberUrl,
      triggers,
      secret,
      active: true,
    });
  } else {
    const created = await createCalcomWebhook(models, {
      subscriberUrl,
      triggers,
      secret,
      active: true,
    });

    webhookId = created?.data?.id || created?.id;
  }

  // Stored only after Cal.com has accepted it. Writing first would leave erxes
  // expecting a secret Cal.com never received if the call failed — every
  // subsequent delivery would 401 with nothing explaining why.
  await models.CalcomConfigs.setConfig('CALCOM_WEBHOOK_SECRET', secret);

  return { status: 'ok', webhookId, subscriberUrl };
};
