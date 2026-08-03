import { Router, type Router as ExpressRouter } from 'express';

import { generateModels } from '~/connectionResolvers';
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
  const verification = verifyCalcomSignature({
    rawBody: req.rawBody,
    signature: req.headers[CALCOM_SIGNATURE_HEADER] as string | undefined,
    secret: process.env.CALCOM_WEBHOOK_SECRET,
  });

  if (!verification.ok) {
    console.error(`calcom webhook rejected: ${verification.reason}`);
    return res.status(401).json({ error: verification.reason });
  }

  try {
    const subdomain = req.subdomain || 'os';
    const models = await generateModels(subdomain);

    const result = await handleCalcomWebhook(models, req.body);

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
