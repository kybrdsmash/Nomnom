/**
 * Pure, read-only helpers turning "how many distinct places has this device
 * reviewed" into a small tier label - no new persistence, no network calls.
 *
 * PROTOTYPE: first-draft reward system built off a one-line ask ("some kind
 * of reward system for completing reviews of places"), refined once to be
 * per-CITY rather than one global stat (user: "just a subtle bar... you've
 * eaten in this area a lot" - plus a real concern about a single global
 * number/list getting unwieldy for someone who travels a lot). Each city
 * section in JournalOverlow.js's existing per-city grouping gets its own
 * tier computed from just that city's entries, rather than a separate
 * summary widget having to compress a whole, possibly-huge travel history
 * into one number. Treat the tier list/thresholds as easy to retune, not
 * final - see the pitch artifact linked in TODO.md.
 */

// Ordered low -> high. Threshold = distinct places reviewed IN ONE CITY
// (revisiting the same spot again doesn't bump this - it's about breadth of
// places tried in that city, not total visits logged there). No 0-tier: this
// is only ever computed for a city that already has at least one entry (see
// JournalOverlay.js's mineByCity, which never produces an empty city bucket).
export const REVIEW_TIERS = [
  { min: 1, name: 'New Taster', icon: '🥄' },
  { min: 3, name: 'Regular', icon: '🍴' },
  { min: 7, name: 'Local Regular', icon: '🍜' },
  { min: 15, name: 'Food Explorer', icon: '🗺️' },
  { min: 30, name: 'Local Legend', icon: '🏆' },
];

// Global (all cities combined) distinct-place count - not currently
// rendered anywhere (see the per-city framing above), kept as a small
// reusable primitive in case a genuine cross-city stat is wanted later.
export function countReviewedPlaces(journal) {
  if (!journal) return 0;
  return Object.values(journal).filter((entries) => entries && entries.length > 0).length;
}

export function getReviewTier(count) {
  let tier = REVIEW_TIERS[0];
  for (const t of REVIEW_TIERS) {
    if (count >= t.min) tier = t;
  }
  return tier;
}

export function getNextTier(count) {
  return REVIEW_TIERS.find((t) => t.min > count) || null;
}

// { count, tier: {min,name,icon}, next: {min,name,icon}|null, toNext: number }
// `count` is caller-supplied (a city's distinct-place count in practice) -
// this function itself doesn't care what scope it was counted over.
export function getReviewStats(count) {
  const tier = getReviewTier(count);
  const next = getNextTier(count);
  return { count, tier, next, toNext: next ? next.min - count : 0 };
}
