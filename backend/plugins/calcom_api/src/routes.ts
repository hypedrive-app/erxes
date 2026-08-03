import { Router, type Router as ExpressRouter } from 'express';

import { generateModels } from '~/connectionResolvers';
import { getCalcomConfig } from '@/bookings/config';
import { reconcileBookings } from '@/bookings/reconcile';
import { handleCalcomWebhook } from '@/bookings/webhook/handler';
import {
  CALCOM_SIGNATURE_HEADER,
  verifyCalcomSignature,
} from '@/bookings/webhook/verify';

// Annotated rather than inferred: under pnpm the inferred type resolves through
// a .pnpm/@types+express-serve-static-core@… path that tsc refuses to emit as
// non-portable (TS2742).
export const router: ExpressRouter = Router();

/**
 * Cal.com webhook receiver.
 *
 * Configure in Cal.com (Settings -> Developer -> Webhooks) against
 *   https://erxes-api.sharksmarketing.com/pl:calcom/calcom/webhook
 * with the same secret as CALCOM_WEBHOOK_SECRET.
 *
 * On status codes: everything that is not an infrastructure failure answers
 * 2xx, including a payload this plugin chooses to ignore. Cal.com retries
 * non-2xx and disables a subscriber that keeps failing, so returning 4xx for
 * "not interesting to us" would eventually switch the integration off. A bad
 * signature is the exception — that is a real rejection and must not look like
 * success.
 */
router.post('/calcom/webhook', async (req, res) => {
  try {
    const subdomain = req.subdomain || 'os';
    // Resolved before verification because the signing secret itself is a
    // stored config with an env fallback — the DB is consulted first, so the
    // connection has to exist before the signature can be checked.
    const models = await generateModels(subdomain);

    const verification = verifyCalcomSignature({
      rawBody: req.rawBody,
      signature: req.headers[CALCOM_SIGNATURE_HEADER] as string | undefined,
      secret: await getCalcomConfig(models, 'CALCOM_WEBHOOK_SECRET'),
    });

    if (!verification.ok) {
      console.error(`calcom webhook rejected: ${verification.reason}`);
      return res.status(401).json({ error: verification.reason });
    }

    const result = await handleCalcomWebhook(models, subdomain, req.body);

    if (result.status === 'ignored') {
      console.log(`calcom webhook ignored: ${result.reason}`);
    }

    return res.status(200).json(result);
  } catch (e) {
    // 500 on purpose: this is our failure, not a malformed delivery, so Cal.com
    // retrying it is the behaviour we want.
    console.error('calcom webhook failed', e);
    return res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * Backfills bookings that never arrived by webhook.
 *
 * Guarded by CALCOM_ADMIN_TOKEN rather than left open: it drives a loop of
 * outbound Cal.com calls and writes to the CRM, so an unauthenticated caller
 * could use it to hammer both. Absent token means the route is unavailable, not
 * that the check is skipped — a deployment that forgot to set it should get 503
 * rather than a public endpoint.
 */
router.post('/calcom/reconcile', async (req, res) => {
  try {
    const subdomain = req.subdomain || 'os';
    const models = await generateModels(subdomain);

    const adminToken = await getCalcomConfig(models, 'CALCOM_ADMIN_TOKEN');

    if (!adminToken) {
      return res
        .status(503)
        .json({ error: 'CALCOM_ADMIN_TOKEN is not configured' });
    }

    if (req.headers.authorization !== `Bearer ${adminToken}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const summary = await reconcileBookings(models, subdomain, {
      afterStart: req.body?.afterStart,
      beforeEnd: req.body?.beforeEnd,
    });

    return res.status(200).json(summary);
  } catch (e) {
    console.error('calcom reconcile failed', e);
    return res.status(500).json({ error: (e as Error).message });
  }
});
