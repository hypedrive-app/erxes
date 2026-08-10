/**
 * Pulls coordinates out of whatever an agent pasted.
 *
 * Agents copy a place from Maps rather than typing latitude and longitude, so
 * accepting only a bare coordinate pair would make this unusable for the case
 * it exists to serve. Three forms are recognised, all of which a Google or
 * Apple Maps URL produces:
 *
 * - `@lat,lng` — the segment in a `google.com/maps/place/.../@19.07,72.87,15z`
 * - `?q=lat,lng` / `?ll=lat,lng` / `&daddr=lat,lng` — query parameter forms
 * - `lat, lng` — a bare pair, pasted from the coordinate readout
 *
 * A shortened `maps.app.goo.gl` link carries no coordinates at all — it has to
 * be resolved by following the redirect, which the browser cannot do
 * cross-origin — so it is rejected by returning null rather than guessed at.
 */
export const parseLocation = (
  input: string,
): { latitude: number; longitude: number } | null => {
  const text = input.trim();

  if (!text) {
    return null;
  }

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|daddr|sll)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);

    if (!match) {
      continue;
    }

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);

    // Meta's own ranges. A pair outside them is a parse that matched the wrong
    // numbers — a zoom level or a place id — rather than a real place.
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
      return { latitude, longitude };
    }
  }

  return null;
};
