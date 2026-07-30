import express, { Router } from 'express';
import {
  plivoAnswerWebhook,
  plivoHangupWebhook,
  plivoRecordingWebhook,
} from '@/integrations/plivo/controller/controller';

export const router: Router = express.Router();

/**
 * Three separate paths because Plivo configures a distinct URL per event on the
 * application: `answer_url` must reply with PlivoXML, while `hangup_url` and
 * the `<Record>` action URL are one-way notifications.
 *
 * No body-parser is mounted here on purpose. `req.rawBody` is already populated
 * for every request by the plugin host, and the handlers read the form-encoded
 * parameters from it — parsing the body again would consume the stream and
 * would not help anyway, since only a JSON parser is installed upstream.
 */
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
