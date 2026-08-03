/**
 * Applies the deployment's accent colour at runtime.
 *
 * The whole accent palette — primary, ring, secondary, and the chart-50..950
 * ramp — is expressed in styles.css as `oklch(<lightness> var(--accent-chroma)
 * var(--accent-hue))`. Those are plain CSS custom properties resolved by the
 * BROWSER, not by Tailwind at build time, so overriding the two variables on
 * <html> retints all 18 tokens with no rebuild and no image change.
 *
 * That matters operationally: core-ui is one image serving several
 * deployments. Baking a colour into the bundle would mean a rebuild per tenant,
 * which is the same trap PLUGIN_CDN_URL and APP_TITLE already avoid by being
 * read from window.env at container start (docker-entrypoint.sh).
 *
 * Accepts either a hex colour or a raw oklch hue, because operators think in
 * hex — they have a brand guide, not an oklch value.
 */

// `window.env` is already declared globally (populated by
// docker-entrypoint.sh); redeclaring it here with a wider value type conflicts
// with that declaration, so this file just consumes it.

/** oklch lightness/chroma/hue, hue in degrees. */
type Oklch = { l: number; c: number; h: number };

const srgbToOklch = (hex: string): Oklch | null => {
  const clean = hex.replace(/^#/, '').trim();

  // Both #abc and #aabbcc are accepted — a three-digit hex is a normal thing
  // to find in a brand guide.
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  const [r, g, b] = [0, 2, 4].map((i) =>
    parseInt(full.slice(i, i + 2), 16) / 255,
  );

  // sRGB -> linear
  const lin = (v: number) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  return {
    l: L,
    c: Math.hypot(A, B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
};

/**
 * Applies one hex colour as the accent, returning whether it was usable.
 *
 * Exported so the org-config path can call it directly: white-label settings
 * arrive after boot, and re-reading window.env at that point would ignore them.
 */
export const applyAccentColor = (colour: string): boolean => {
  const parsed = srgbToOklch(colour);

  if (!parsed) return false;

  const root = document.documentElement;

  root.style.setProperty('--accent-hue', parsed.h.toFixed(2));
  // Chroma comes from the brand colour too, so a deliberately muted brand
  // stays muted instead of being forced to the default's saturation.
  root.style.setProperty('--accent-chroma', parsed.c.toFixed(4));

  return true;
};

/**
 * Applies the DEPLOYMENT's accent from window.env, before the first paint.
 *
 * This is the floor, not the last word: white-label settings stored in the CRM
 * override it once /initial-setup answers (see applyOrgAccent). Setting the env
 * value first is what keeps a themed deployment from flashing the stock accent
 * while that request is in flight.
 *
 * Absent or unparseable values leave the stylesheet default in place — a typo
 * should not produce an unreadable app.
 */
export const applyRuntimeTheme = () => {
  const env: Record<string, string | undefined> = window.env ?? {};

  const colour = env.REACT_APP_ACCENT_COLOR;

  if (colour) {
    if (applyAccentColor(colour)) return;

    // Named rather than swallowed: a mistyped brand colour otherwise looks
    // like the feature simply does not work.
    console.warn(
      `[theme] REACT_APP_ACCENT_COLOR="${colour}" is not a hex colour; keeping the default accent.`,
    );
  }

  const hue = env.REACT_APP_ACCENT_HUE;

  if (hue && Number.isFinite(Number(hue))) {
    document.documentElement.style.setProperty(
      '--accent-hue',
      String(Number(hue)),
    );
  }
};

/**
 * Applies the accent stored in the CRM's white-label settings.
 *
 * Called when /initial-setup resolves. A stored colour outranks the deployment
 * env because it is the more specific decision — an operator changed it in this
 * instance's own settings — and it is the only one that can be changed without
 * a redeploy.
 */
export const applyOrgAccent = (colour?: string | null) => {
  if (!colour) return;

  if (!applyAccentColor(colour)) {
    console.warn(
      `[theme] white-label accent "${colour}" is not a hex colour; keeping the deployment default.`,
    );
  }
};
