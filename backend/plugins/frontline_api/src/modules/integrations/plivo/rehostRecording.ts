import { randomUUID } from 'node:crypto';
import { promises as fsPromises } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uploadFileToStorage } from 'erxes-api-shared/utils';
import { debugError, debugPlivo } from '@/integrations/plivo/debuggers';

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

/** Plivo caps `<Record maxLength>` at an hour; an hour of mono WAV is ~57MB. */
const MAX_RECORDING_BYTES = 100 * 1024 * 1024;

/**
 * How long the download may take before it is abandoned.
 *
 * The webhook has already been acknowledged by the time this runs, so a slow
 * Plivo cannot make Plivo retry the callback — but without a ceiling the request
 * could pin a socket and a temp file indefinitely.
 */
const DOWNLOAD_TIMEOUT_MS = 60_000;

/** Plivo writes WAV by default and MP3 when the application asks for it. */
const MIME_BY_EXTENSION: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
};

const getErrorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * Derives the stored file name from the recording URL.
 *
 * Plivo's URL ends in `<recording-id>.wav`, which already identifies the file;
 * the call uuid is prefixed so a recording can be traced back to its call from
 * the storage listing alone. Anything that is not a word character is dropped
 * because the name reaches an object store key.
 */
export const buildRecordingFileName = (
  recordUrl: string,
  callUuid?: string,
): string => {
  let extension = 'wav';

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
  'audio/wav';

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

    const response = await fetchRecording(recordUrl, {
      headers,
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (!buffer.byteLength) {
      throw new Error('Recording body was empty');
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

    // The URL is logged so an operator can retry by hand; it carries no
    // credentials, unlike the auth token which is never logged.
    debugError(
      `Failed to re-host Plivo recording ${recordUrl} for call ${callUuid}, ` +
        `keeping the provider URL: ${failureReason}`,
    );

    return { failureReason };
  } finally {
    if (tmpPath) {
      await fsPromises.rm(tmpPath, { force: true }).catch(() => undefined);
    }
  }
};
