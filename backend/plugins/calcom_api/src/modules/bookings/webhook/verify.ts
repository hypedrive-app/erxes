import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies the signature Cal.com puts on every webhook delivery.
 *
 * The contract is fixed by the sender, so this mirrors it exactly rather than
 * inventing a scheme. From cal.com's packages/features/webhooks/lib/sendPayload.ts:
 *
 *   createWebhookSignature = ({ secret, body }) =>
 *     createHmac("sha256", secret).update(`${body}`).digest("hex")
 *   headers["X-Cal-Signature-256"] = createWebhookSignature({ secret, body })
 *
 * Two details that are easy to get wrong:
 *
 * 1. The HMAC covers the RAW request body, not a re-serialised object. Passing
 *    JSON.stringify(req.body) through here would fail for any payload where
 *    key order or unicode escaping differs from what cal.com sent.
 * 2. There is no timestamp in the signed material — unlike the call-integration
 *    webhook in frontline_api, which signs `${timestamp}.${rawBody}`. So there
 *    is no replay window to enforce here, and pretending otherwise would reject
 *    legitimate retries.
 */

export const CALCOM_SIGNATURE_HEADER = 'x-cal-signature-256';

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export const verifyCalcomSignature = ({
  rawBody,
  signature,
  secret,
}: {
  rawBody?: Buffer | string;
  signature?: string | string[];
  secret?: string;
}): VerifyResult => {
  if (!secret) {
    return { ok: false, reason: 'no_secret_configured' };
  }

  if (!rawBody || !rawBody.length) {
    // Without the raw body there is nothing trustworthy to hash. Failing here
    // is deliberate: falling back to the parsed body would let a payload
    // through whose bytes we never actually verified.
    return { ok: false, reason: 'raw_body_unavailable' };
  }

  if (!signature || Array.isArray(signature)) {
    return { ok: false, reason: 'missing_signature' };
  }

  const expected = createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody)
    .digest('hex');

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);

  // Length is compared first because timingSafeEqual throws on a mismatch
  // rather than returning false.
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return { ok: false, reason: 'signature_mismatch' };
  }

  return { ok: true };
};
