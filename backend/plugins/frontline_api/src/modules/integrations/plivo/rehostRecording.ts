import { randomUUID } from 'node:crypto';
import { promises as fsPromises } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uploadFileToStorage } from 'erxes-api-shared/utils';
import { debugPlivo } from '@/integrations/plivo/debuggers';

/**
 * A recording Plivo hosts, copied into erxes storage so it outlives Plivo's
 * retention window.
 *
 * `storageKey` is undefined when the copy failed. The caller keeps the provider
 * URL in that case rather than dropping the recording — a URL that expires in 90
 * days beats no audio at all.
 */
export interface IRehostedRecording {
  storageKey?: string;
  failureReason?: string;
}

/**
 * Plivo caps `<Record maxLength>` at an hour. An hour of MP3 — Plivo's actual
 * default format, confirmed against a real `RecordUrl` — is a few megabytes at
 * typical call-quality bitrates, so this cap is generous rather than tight; it
 * exists to reject a corrupt or unexpectedly huge download, not to fit a
 * specific format's real size.
 */
const MAX_RECORDING_BYTES = 100 * 1024 * 1024;

/**
 * How long the download may take before it is abandoned.
 *
 * The webhook has already been acknowledged by the time this runs, so a slow
 * Plivo cannot make Plivo retry the callback — but without a ceiling the request
 * could pin a socket and a temp file indefinitely.
 */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Delays before each retry of the download, in milliseconds.
 *
 * Plivo posts the recording callback the moment `<Record>` ends, BEFORE the mp3
 * is readable on its media host — the file is published asynchronously. Measured
 * against production rows on 2026-07-31, our write landed 181-271ms after the
 * `add_time` the Recording API reports, and in one case ~2s BEFORE it, and every
 * one of those downloads came back 403. Plivo answers a not-yet-published
 * recording with 403 (not 404), which is indistinguishable from a genuine auth
 * failure by status alone, so the only safe reading is "not ready yet, come
 * back".
 *
 * Without this wait every single recording fell back to the provider URL and
 * nothing was ever copied into erxes storage. The schedule is deliberately
 * back-loaded: the first attempt almost always fails because it races the
 * publish, so the useful attempts are the later ones. Total added latency on a
 * genuinely missing recording is ~31s, which is acceptable in a webhook that has
 * already been acknowledged.
 */
const RETRY_DELAYS_MS = [1_000, 3_000, 7_000, 20_000] as const;

/**
 * Plivo's own default is MP3, not WAV — its `<Record>` XML element documents
 * `fileFormat` as defaulting to `mp3`, confirmed against a real recording
 * callback whose `RecordUrl` ends `.mp3` with no `fileFormat` set anywhere in
 * this codebase's XML. This was previously assumed backwards.
 * https://www.plivo.com/docs/voice/xml/record
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Statuses that mean "the recording is not on the media host yet".
 *
 * 403 is the one Plivo actually returns for an unpublished recording — verified
 * against a recording id that does not exist, which also answers 403 rather than
 * 404. 404 and 5xx are included because they are retryable for the same reason:
 * the object is not servable yet and may be a moment later.
 */
const isRetryableStatus = (status: number): boolean =>
  status === 403 || status === 404 || status === 429 || status >= 500;

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * Derives the stored file name from the recording URL.
 *
 * Plivo's URL ends in `<recording-id>.<format>` — `.mp3` by default, `.wav`
 * only when `fileFormat="wav"` is set on `<Record>`, which nothing in this
 * codebase does — so the extension already identifies the real file. The call
 * uuid is prefixed so a recording can be traced back to its call from the
 * storage listing alone. Anything that is not a word character is dropped
 * because the name reaches an object store key.
 */
export const buildRecordingFileName = (
  recordUrl: string,
  callUuid?: string,
): string => {
  // Matches Plivo's own default, so a URL this cannot parse still gets the
  // extension the file actually has rather than the wrong one.
  let extension = 'mp3';

  try {
    const { pathname } = new URL(recordUrl);
    const last = pathname.split('/').filter(Boolean).pop() || '';
    const parsed = last.split('.').pop() || '';

    if (parsed && parsed !== last && MIME_BY_EXTENSION[parsed.toLowerCase()]) {
      extension = parsed.toLowerCase();
    }
  } catch {
    // Not a URL we can parse; the default extension stands.
  }

  const identifier = (callUuid || randomUUID()).replace(/[^\w-]/g, '');

  return `plivo-recording-${identifier}.${extension}`;
};

const getMimetype = (fileName: string): string =>
  MIME_BY_EXTENSION[fileName.split('.').pop()?.toLowerCase() || ''] ||
  'audio/mpeg';

/**
 * The dependencies this module reaches outside the process through, injected so
 * the download and fallback behaviour can be exercised without a network or an
 * object store.
 */
export interface IRehostDependencies {
  fetchRecording: typeof fetch;
  uploadFile: typeof uploadFileToStorage;
}

const defaultDependencies: IRehostDependencies = {
  fetchRecording: (input, init) => fetch(input, init),
  uploadFile: uploadFileToStorage,
};

/**
 * Copies a Plivo recording into erxes storage and returns its storage key.
 *
 * Plivo stores recordings free for the first 90 days and bills for storage after
 * that, so the audio is re-hosted the way the Grandstream integration already
 * does rather than leaving erxes dependent on Plivo's copy.
 *
 * Recording URLs are unguessable and public by default, but an account can turn
 * on Basic auth for them. The credentials are therefore sent whenever the
 * integration holds them: a public URL ignores the header, so one code path
 * serves both configurations.
 *
 * This never throws. A failure is reported through `failureReason` so the caller
 * can fall back to storing the provider URL instead of losing the recording.
 */
export const rehostPlivoRecording = async (
  {
    subdomain,
    recordUrl,
    callUuid,
    authId,
    authToken,
  }: {
    subdomain: string;
    recordUrl: string;
    callUuid?: string;
    authId?: string;
    authToken?: string;
  },
  dependencies: IRehostDependencies = defaultDependencies,
): Promise<IRehostedRecording> => {
  const { fetchRecording, uploadFile } = dependencies;

  let tmpPath: string | undefined;

  try {
    const headers: Record<string, string> = {};

    if (authId && authToken) {
      headers.Authorization = `Basic ${Buffer.from(
        `${authId}:${authToken}`,
      ).toString('base64')}`;
    }

    let buffer: Buffer | undefined;
    let lastFailure = '';

    // One attempt per delay, plus the immediate one: the recording is usually
    // published within a few seconds of the callback, but never by the time it
    // arrives.
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) {
        await delay(RETRY_DELAYS_MS[attempt - 1]);
      }

      try {
        const response = await fetchRecording(recordUrl, {
          headers,
          signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });

        if (!response.ok) {
          lastFailure = `HTTP ${response.status}`;

          if (isRetryableStatus(response.status)) {
            continue;
          }

          throw new Error(lastFailure);
        }

        const body = Buffer.from(await response.arrayBuffer());

        // A zero-length 200 is the same "published but not written yet" race in
        // a different disguise, so it is worth another attempt rather than an
        // immediate fallback.
        if (!body.byteLength) {
          lastFailure = 'Recording body was empty';
          continue;
        }

        buffer = body;
        break;
      } catch (e) {
        // A timeout or socket error is transient in exactly the same way; the
        // loop is the retry for it too. The last one falls through below.
        lastFailure = getErrorMessage(e);
      }
    }

    if (!buffer) {
      throw new Error(
        `Recording was still unavailable after ${
          RETRY_DELAYS_MS.length + 1
        } attempts: ${lastFailure}`,
      );
    }

    if (buffer.byteLength > MAX_RECORDING_BYTES) {
      throw new Error(`Recording is ${buffer.byteLength} bytes, over the cap`);
    }

    const fileName = buildRecordingFileName(recordUrl, callUuid);

    // `uploadFileToStorage` reads from disk and rejects any path outside the
    // temp directory, so the download is written there rather than passed as a
    // buffer.
    tmpPath = join(tmpdir(), `${randomUUID()}-${fileName}`);
    await fsPromises.writeFile(tmpPath, buffer);

    const storageKey = await uploadFile({
      subdomain,
      filePath: tmpPath,
      fileName,
      mimetype: getMimetype(fileName),
    });

    if (!storageKey) {
      throw new Error('Storage returned no key');
    }

    debugPlivo(
      `Re-hosted Plivo recording for call ${callUuid} (${buffer.byteLength} bytes)`,
    );

    return { storageKey };
  } catch (e) {
    const failureReason = getErrorMessage(e);

    // console.error, NOT the `debug` namespace this used to use: `debug` writes
    // nothing unless DEBUG enables the namespace, and DEBUG is unset in the
    // container — so every one of these failures was invisible in production
    // while recordings silently kept only a provider URL that Plivo deletes
    // after 90 days. A data-loss fallback has to be loud.
    //
    // The URL is logged so an operator can retry by hand; it carries no
    // credentials, unlike the auth token which is never logged.
    console.error(
      `[plivo] Failed to re-host recording ${recordUrl} for call ${callUuid}, ` +
        `keeping the provider URL (expires ~90d): ${failureReason}`,
    );

    return { failureReason };
  } finally {
    if (tmpPath) {
      await fsPromises.rm(tmpPath, { force: true }).catch(() => undefined);
    }
  }
};
