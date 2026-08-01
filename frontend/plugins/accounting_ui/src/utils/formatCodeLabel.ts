/**
 * Formats a related record as "code - name" for display in table cells.
 *
 * Relations such as product/account/branch/department are resolved by id and
 * may be missing (e.g. the referenced record was deleted). Interpolating them
 * into a template literal directly would render the literal text
 * "undefined - undefined" to the user, so absent parts are dropped and the
 * separator is only emitted when both sides are present.
 */
export const formatCodeLabel = (
  code?: string | null,
  name?: string | null,
): string => [code, name].filter(Boolean).join(' - ');
