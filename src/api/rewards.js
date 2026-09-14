/**
 * Pure, read-only helpers that turn the existing local food journal
 * (src/storage.js's journal shape: { [placeId]: [entries] }) into a small
 * "how much reviewing have I done" summary - no new persistence, no
 * network calls, no dependency on anything outside the journal object
 * that's already passed around.
 *
 * PROTOTYPE: this backs a first-draft reward system built off a one-line
 * ask ("some kind of reward system for completing reviews of places")
 * with no spec yet for what the reward actually is. This file implements
 * the smallest option considered (a tiered badge, see the pitch artifact) -
 * treat the tier list/thresholds as easy to retune or replace, not final.
 */

// Ordered low -> high. Threshold = distinct places with at least one journal
// entry (revisiting the same spot again doesn't bump this - the badge is
// about breadth of places tried, not total visits logged).
export const REVIEW_TIERS = [
  { min: 0, name: 'No Reviews Yet', icon: '🍽️' },
  { min: 1, name: 'New Taster', icon: '🥄' },
  { min: 3, name: 'Regular', icon: '🍴' },
  { min: 7, name: 'Local Regular', icon: '🍜' },
  { min: 15, name: 'Food Explorer', icon: '🗺️' },
  { min: 30, name: 'Local Legend', icon: '🏆' },
];

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
export function getReviewStats(journal) {
  const count = countReviewedPlaces(journal);
  const tier = getReviewTier(count);
  const next = getNextTier(count);
  return { count, tier, next, toNext: next ? next.min - count : 0 };
}
