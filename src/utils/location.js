import { getTrueDistance } from './geo';

// spot.address comes from two different Google fields depending on how the
// spot was found, and they have different shapes:
//  - Nearby Search's `vicinity` (shapeSpot in src/api/places.js): usually
//    "{street}, {city}" - city is the LAST segment.
//  - Text Search's `formatted_address` (shapeSearchResult in
//    src/api/placeSearch.js, used by PlaceSearchBar for manually-added
//    favorites/reviews): "{street}, {city}, {state} {zip}, {country}" - the
//    last segment there is the COUNTRY, not the city (was showing every
//    manually-searched favorite as "Unknown Location"/the country - user
//    feedback caught this). City is 3rd-from-last in that 4-part shape.
export function cityFromAddress(address) {
  if (!address || !address.trim()) return 'Unknown Location';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return 'Unknown Location';
  if (parts.length >= 4) return parts[parts.length - 3];
  // 3 segments is ambiguous ("street, city, country" vs "city, state,
  // country") but the middle one is the more common city placement either way.
  if (parts.length === 3) return parts[1];
  return parts[parts.length - 1];
}

/**
 * Buckets a list of spots (must have `.address`, and `.lat`/`.lng` for
 * distance sorting) by city, sorted nearest-to-`location` first - lets a
 * long list of favorites/journal entries collected across many trips stay
 * organized by place instead of one giant flat list, and surfaces whichever
 * city is relevant to wherever the user currently is. Returns
 * `[{ city, distanceMiles, spots }]`; a bucket with no usable location (or
 * no current `location` to measure from) sorts last with `distanceMiles: null`.
 */
export function groupByCity(spots, location) {
  const buckets = new Map();
  spots.forEach((spot) => {
    const city = cityFromAddress(spot.address);
    if (!buckets.has(city)) buckets.set(city, []);
    buckets.get(city).push(spot);
  });

  const result = Array.from(buckets.entries()).map(([city, citySpots]) => {
    const rep = citySpots.find((s) => s.lat != null && s.lng != null);
    const distanceMiles =
      location && rep ? parseFloat(getTrueDistance(location.latitude, location.longitude, rep.lat, rep.lng)) : null;
    // Alphabetical within the city - once a city's list grows, "nearest
    // first" ordering (which only applies BETWEEN cities anyway) gave no
    // organizing principle for finding one specific place inside it.
    const sortedSpots = [...citySpots].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '')
    );
    return { city, distanceMiles, spots: sortedSpots };
  });

  result.sort((a, b) => {
    if (a.distanceMiles == null) return 1;
    if (b.distanceMiles == null) return -1;
    return a.distanceMiles - b.distanceMiles;
  });

  return result;
}
