/**
 * Derives a company avatar from its website.
 *
 * erxes stores `avatar` as a plain string and never populates it: there is no
 * resolver, hook or service that fills it, so on an imported dataset every
 * company renders with a blank placeholder even though its domain is known.
 * Commercial CRMs paper over this with a logo vendor (Clearbit and friends);
 * this does the same job with the public favicon endpoint, which needs no key,
 * no account and no per-record request from us — the browser fetches it, and
 * Google resolves and caches the icon behind the URL.
 *
 * Deliberately a pure function over the domain rather than a crawl of the site:
 * scraping `<link rel="icon">` means an outbound request per company, breaks on
 * sites that are slow or down at import time, and yields URLs that rot when the
 * brand redeploys its storefront. A domain is stable for as long as the company
 * is a company.
 */

/** Widths the endpoint serves cleanly. 128 stays sharp on retina list rows. */
const FAVICON_SIZE = 128;

/**
 * Reduce a website to the bare registrable host.
 *
 * Returns undefined for anything that is not a usable host, so callers can
 * treat "no derivable avatar" and "no website" identically.
 */
export const extractDomain = (website?: string | null): string | undefined => {
  if (!website) {
    return undefined;
  }

  const trimmed = website.trim();

  if (!trimmed) {
    return undefined;
  }

  // Accept bare hosts ("acme.in") as well as full URLs; the URL parser needs a
  // scheme, and stored values are inconsistent about having one.
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let host: string;

  try {
    host = new URL(withScheme).hostname;
  } catch {
    return undefined;
  }

  const normalized = host.toLowerCase().replace(/^www\./, '');

  // A host with no dot is a hostname on some private network, not a public
  // domain the favicon service could resolve.
  return normalized.includes('.') ? normalized : undefined;
};

/**
 * Build the avatar URL for a website, or undefined when none can be derived.
 */
export const buildAvatarFromWebsite = (
  website?: string | null,
): string | undefined => {
  const domain = extractDomain(website);

  return domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=${FAVICON_SIZE}`
    : undefined;
};

/**
 * Fill in `doc.avatar` from the website when the caller did not supply one.
 *
 * Never overwrites an existing avatar: a human-uploaded logo, or one set by an
 * enrichment provider, always outranks a derived favicon. `existingAvatar` lets
 * update paths honour an avatar already stored on the record even when the
 * incoming patch does not mention it.
 */
export const applyDerivedAvatar = <T extends { website?: string; avatar?: string }>(
  doc: T,
  existingAvatar?: string,
): T => {
  if (doc.avatar || existingAvatar) {
    return doc;
  }

  const avatar = buildAvatarFromWebsite(doc.website);

  if (avatar) {
    doc.avatar = avatar;
  }

  return doc;
};
