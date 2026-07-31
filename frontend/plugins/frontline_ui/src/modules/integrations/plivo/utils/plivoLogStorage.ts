/**
 * The localStorage key the Plivo Browser SDK writes its internal log to.
 *
 * Taken from `PlivoLogStorage.TAG` in `plivo-browser-sdk@2.2.21`
 * (`lib/storage.ts`). It is the ONLY key the SDK writes without a guard: every
 * other write goes through its `store()` helper, which swallows failures in a
 * try/catch and only ever holds short `debug`/`feedback` values.
 */
export const PLIVO_LOG_STORAGE_KEY = 'PlivoLogStorage';

/**
 * How much of the SDK's log we are willing to leave in localStorage.
 *
 * The origin quota is ~5 MB of UTF-16 (10 MB of storage) shared by EVERY key on
 * the origin, so this budget is deliberately a rounding error against it: the
 * log is only ever read by a human debugging a call, and 64 KB is already
 * hundreds of the SDK's log lines.
 */
const PLIVO_LOG_MAX_CHARS = 64 * 1024;

/**
 * Trims the SDK's log store back under budget, and reports whether room was
 * made.
 *
 * WHY THIS EXISTS
 *
 * `PlivoLogStorage.setData()` in the SDK is:
 *
 *     setData(prefix, category, message) {
 *       const previous = this.getData();
 *       ...
 *       window.localStorage.setItem(this.TAG, JSON.stringify(next));
 *     }
 *
 * It appends to the previous value and never trims, so the key grows without
 * bound for the life of the browser profile — and unlike the rest of the SDK's
 * storage access, that `setItem` is NOT wrapped in a try/catch. It is reached
 * from `Logger._appendToQueue()`, which runs on EVERY log call for the INIT,
 * LOGIN, CALLING, LOGOUT, CRASH, CALL_QUALITY, NETWORK_CHANGE, NIMBUS and WS
 * categories, before the log-level filter is applied — so `debug: 'ERROR'` does
 * not stop it, and neither does `enableTracking`.
 *
 * Two failures follow from that, and they are the same failure:
 *
 * 1. Once the key saturates the origin quota, EVERY OTHER localStorage write on
 *    the origin throws `QuotaExceededError` — including writes by unrelated
 *    features. That is what surfaced as the "Module unavailable" /
 *    "failed to load" error on the customer detail sheet: the federation module
 *    loaded fine, but a 1 KB write during its render threw and React Router
 *    reported it as a render error.
 *
 * 2. The SDK's own login is aborted by it. `_loginWithAccessToken()` wraps its
 *    whole body in `try { ... } catch (e) { return false; }`, and the first
 *    thing the success branch does is
 *    `log.info(LOGCAT.LOGIN, 'Login initiated with AccessToken', token)` — which
 *    reaches the unguarded `setItem`. The throw is swallowed by that catch and
 *    login returns `false` BEFORE `tokenLogin()` runs, so no WebSocket is ever
 *    opened and no `onLoginFailed` is ever emitted. The softphone sits on
 *    "Connection error" forever with a perfectly valid token.
 *
 * Trimming rather than always clearing keeps the most recent log lines, which
 * are the ones worth having when someone does look. The value is a
 * JSON-encoded string of newline-separated lines, so it is cut on a line
 * boundary to leave the remainder parseable by the same `JSON.parse` the SDK
 * does on its next append.
 */
export const trimPlivoLogStorage = (): boolean => {
  try {
    const raw = window.localStorage.getItem(PLIVO_LOG_STORAGE_KEY);

    if (raw === null) return true;
    if (raw.length <= PLIVO_LOG_MAX_CHARS) return true;

    // The SDK stores `JSON.stringify(lines.join('\n'))`. Anything else (a value
    // from another SDK version, or a truncated write) is not worth salvaging.
    const decoded: unknown = JSON.parse(raw);

    if (typeof decoded !== 'string') {
      window.localStorage.removeItem(PLIVO_LOG_STORAGE_KEY);
      return true;
    }

    const tail = decoded.slice(-PLIVO_LOG_MAX_CHARS);
    const lineBreak = tail.indexOf('\n');
    const kept = lineBreak === -1 ? tail : tail.slice(lineBreak + 1);

    window.localStorage.setItem(
      PLIVO_LOG_STORAGE_KEY,
      JSON.stringify(kept),
    );

    return true;
  } catch {
    // Either the stored value was not the shape we expect, or the quota is so
    // tight that even the smaller replacement would not fit. Dropping the key
    // is always safe — the SDK re-creates it on its next log line — and it is
    // the only action that reliably frees the space other features need.
    try {
      window.localStorage.removeItem(PLIVO_LOG_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
};
