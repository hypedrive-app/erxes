/**
 * Meta's per-type upload ceilings, mirrored from the same reference the API
 * enforces against.
 * https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media/
 *
 * These are duplicated rather than imported: `frontline_api` owns the
 * authoritative copy and stays the one that rejects a send, but a plugin's
 * frontend cannot import from its backend. The API remains the enforcement
 * point — this exists only so an agent is told before a file is uploaded
 * instead of after, and the two lists are small and change on Meta's schedule.
 */
export const WHATSAPP_MEDIA_MAX_BYTES = {
  image: 5 * 1024 * 1024,
  document: 100 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  sticker: 500 * 1024,
} as const;

export type WhatsappMediaType = keyof typeof WHATSAPP_MEDIA_MAX_BYTES;

/**
 * How Meta writes each ceiling, used verbatim when telling an agent what the
 * limit is.
 *
 * `formatBytes` is not used for this: it divides by 1000, so the 5MiB image
 * ceiling would render as "5.24 MB" and the sticker one as "512 KB" — numbers
 * that appear nowhere in Meta's documentation and that an agent cannot act on.
 * A file's own size still goes through `formatBytes`, matching how every other
 * attachment size in the composer is already displayed.
 */
export const WHATSAPP_MEDIA_MAX_LABEL: Record<WhatsappMediaType, string> = {
  image: '5MB',
  document: '100MB',
  audio: '16MB',
  video: '16MB',
  sticker: '500KB',
};

/**
 * Maps a MIME type onto the message type Meta expects.
 *
 * Kept identical to the backend's `whatsappMediaTypeFor`, because a file this
 * classifies differently would be checked against one ceiling here and a
 * different one at send time — which is worse than not checking at all.
 */
export const whatsappMediaTypeFor = (mimetype = ''): WhatsappMediaType => {
  const mime = mimetype.toLowerCase();

  // WebP is a sticker to Meta, not an image, and carries a far smaller ceiling.
  if (mime === 'image/webp') return 'sticker';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  return 'document';
};

/**
 * Names the files WhatsApp would reject, so the caller can report them and
 * upload the rest.
 *
 * Returns the reason per file rather than a boolean: the useful message says
 * which file, how big it is, and what the ceiling for its kind is — "too large"
 * alone leaves an agent guessing whether to resize or to send another way.
 */
export const findOversizedWhatsappFiles = (
  files: File[],
): Array<{ file: File; mediaType: WhatsappMediaType; limit: string }> =>
  files.flatMap((file) => {
    const mediaType = whatsappMediaTypeFor(file.type);

    return file.size > WHATSAPP_MEDIA_MAX_BYTES[mediaType]
      ? [{ file, mediaType, limit: WHATSAPP_MEDIA_MAX_LABEL[mediaType] }]
      : [];
  });
