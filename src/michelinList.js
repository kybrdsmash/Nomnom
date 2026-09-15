/**
 * Hand-curated Michelin list (user's own choice, see the conversation this
 * shipped from - Google Places has no award/Michelin data at all, and there's
 * no official Michelin API or public export; an unofficial scraped dataset
 * would cover more places but isn't Michelin-sanctioned data). Keep this
 * small and accurate rather than trying to be exhaustive - a wrong badge is
 * worse than a missing one.
 *
 * Matched by restaurant name (case-insensitive, trimmed) against spot.name -
 * not Google's place_id, since that's not something you'd know offhand when
 * adding an entry. Michelin-starred places are essentially always single-
 * location, so name collisions should be rare in practice; `city` is here to
 * disambiguate the rare case it isn't (not yet used for matching - add city
 * matching too if a real collision ever comes up).
 *
 * `stars`: 1-3 for a starred restaurant. `bibGourmand: true` instead for a
 * Bib Gourmand pick (good food at a moderate price - Michelin's other main
 * distinction, no star).
 */
export const MICHELIN_LIST = [
  // { name: 'The French Laundry', city: 'Yountville, CA', stars: 3 },
];

export function getMichelinEntry(spotName) {
  if (!spotName) return null;
  const normalized = spotName.trim().toLowerCase();
  return MICHELIN_LIST.find((e) => e.name.trim().toLowerCase() === normalized) || null;
}
