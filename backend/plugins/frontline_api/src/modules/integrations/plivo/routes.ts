import express, { Router } from 'express';
import {
  plivoAnswerWebhook,
  plivoHangupWebhook,
  plivoRecordingWebhook,
  plivoVoicemailWebhook,
} from '@/integrations/plivo/controller/controller';

export const router: Router = express.Router();

/**
 * Three separate paths because Plivo configures a distinct URL per event on the
 * application: `answer_url` must reply with PlivoXML, while `hangup_url` and
 * the `<Record>` action URL are one-way notifications.
 *
 * Plivo posts `application/x-www-form-urlencoded`, and the plugin host installs
 * only `express.json` — whose `verify` hook never fires for a form body, so
 * `req.rawBody` would be undefined and every callback would parse to zero
 * parameters. A form parser is therefore mounted here, capturing the raw bytes
 * in `verify` because the V3 signature covers the body exactly as sent and
 * re-serialising a parsed object can reorder or re-encode it.
 *
 * `express.json` is mounted too: a Plivo application can be configured to post
 * JSON instead, and the host's own parser has already run by this point, so
 * this one is a no-op unless the body was left unread.
 */
router.use(
  express.urlencoded({
    extended: false,
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
      req.rawBody = buf;
    },
  }),
);

router.use(
  express.json({
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
      req.rawBody = buf;
    },
  }),
);

router.post('/answer', async (req, res, next) => {
  try {
    await plivoAnswerWebhook(req, res, next);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Answer webhook handling failed',
      error: err.message || err.toString(),
    });
  }
});

router.post('/hangup', async (req, res, next) => {
  try {
    await plivoHangupWebhook(req, res, next);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Hangup webhook handling failed',
      error: err.message || err.toString(),
    });
  }
});

router.post('/recording', async (req, res, next) => {
  try {
    await plivoRecordingWebhook(req, res, next);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Recording webhook handling failed',
      error: err.message || err.toString(),
    });
  }
});

// The `<Record>` an unanswered inbound call falls through to. Kept apart from
// `/recording` so a voicemail is never stored as a call recording.
router.post('/voicemail', async (req, res, next) => {
  try {
    await plivoVoicemailWebhook(req, res, next);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Voicemail webhook handling failed',
      error: err.message || err.toString(),
    });
  }
});
