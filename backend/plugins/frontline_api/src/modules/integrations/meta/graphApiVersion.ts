/**
 * Graph API version used for Messenger and Instagram calls via `fbgraph`.
 *
 * A version stays usable for at least two years after its successor ships, and
 * Meta is explicit about what happens past that: "once a version is no longer
 * usable, any calls made to it will be defaulted to the next oldest, usable
 * version". An expired pin therefore does NOT fail loudly — it silently runs
 * on whatever Meta picks, which is neither the version the code was written
 * against nor a version anyone chose.
 *
 * That was the state before this constant existed: Facebook pinned `7.0`
 * (released March 2020, expired years ago) and Instagram pinned `21.0`, from
 * the same shared `graphRequest` helper. Both now use one current version, so
 * the pin means what it says.
 *
 * Kept in sync with WhatsApp's own GRAPH_API_VERSION, which pins the same
 * v26.0 for the Cloud API.
 * https://developers.facebook.com/docs/graph-api/guides/versioning
 * https://developers.facebook.com/docs/graph-api/changelog
 */
export const META_GRAPH_API_VERSION = '26.0';
