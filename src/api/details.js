import { loadDetailsCache, saveDetailsCache } from '../storage';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

// Cache details per place, persisted to AsyncStorage so reopening the same
// spot's detail view - even in a brand new app session - never re-costs a
// Place Details call. Entries expire after a day (hours/reviews can drift)
// and the cache is capped so it doesn't grow forever across months of use.
const detailsCache = new Map(); // placeId -> { data, cachedAt }
const DETAILS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DETAILS_CACHE = 500;

// Words indicating a review is actually about the food/dish itself (taste,
// menu, ingredients) rather than purely service/ambiance/parking - used to
// rank food-focused reviews above generic ones. Google's Place Details API
// hard-caps reviews at 5 per place regardless of a place's real review
// count, so this re-ranks that fixed set rather than filtering a larger
// pool (there isn't one available via the API).
const FOOD_KEYWORDS = [
  'food', 'dish', 'dishes', 'meal', 'menu', 'taste', 'tasty', 'flavor', 'flavour',
  'delicious', 'yummy', 'portion', 'portions', 'appetizer', 'entree', 'entrée',
  'dessert', 'sauce', 'spice', 'spicy', 'fresh', 'recipe', 'chef', 'cooked',
  'cuisine', 'ingredient', 'ingredients', 'seasoning', 'texture', 'juicy',
  'crispy', 'bland', 'overcooked', 'undercooked',
];

function isFoodFocused(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return FOOD_KEYWORDS.some((word) => lower.includes(word));
}

// Food-focused reviews first (that's what a "should I eat here" decision
// actually needs), highest-rated first within each group - a glowing food
// review leads, a so-so food review comes next, then non-food reviews by
// rating, ending on the lowest-rated review in the set.
function rankReviews(reviews) {
  return [...reviews].sort((a, b) => {
    const foodDiff = (isFoodFocused(b.text) ? 1 : 0) - (isFoodFocused(a.text) ? 1 : 0);
    if (foodDiff !== 0) return foodDiff;
    return (b.rating || 0) - (a.rating || 0);
  });
}

let hydrating = null;
function ensureHydrated() {
  if (!hydrating) {
    hydrating = loadDetailsCache().then((stored) => {
      const now = Date.now();
      Object.entries(stored || {}).forEach(([id, entry]) => {
        if (entry && now - entry.cachedAt < DETAILS_CACHE_TTL_MS) {
          detailsCache.set(id, entry);
        }
      });
    });
  }
  return hydrating;
}

function persistDetailsCache() {
  if (detailsCache.size > MAX_DETAILS_CACHE) {
    const oldestFirst = [...detailsCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    oldestFirst.slice(0, detailsCache.size - MAX_DETAILS_CACHE).forEach(([id]) => detailsCache.delete(id));
  }
  const obj = {};
  detailsCache.forEach((entry, id) => { obj[id] = entry; });
  saveDetailsCache(obj);
}

/**
 * Fetches richer info for ONE place, on demand (user tapped for details).
 * This is a paid-tier call, so it only ever runs when explicitly requested -
 * never for the whole pool. Returns { photos, reviews, hours, website, phone }.
 */
export async function fetchPlaceDetails(placeId) {
  await ensureHydrated();
  const cached = detailsCache.get(placeId);
  if (cached) return cached.data;
  if (!GOOGLE_API_KEY) return null;

  const fields = [
    'photo', 'review', 'opening_hours', 'website',
    'formatted_phone_number', 'url',
  ].join(',');

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${placeId}` +
    `&fields=${fields}` +
    `&key=${GOOGLE_API_KEY}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.status !== 'OK') {
      console.warn('Place Details error:', data.status);
      return null;
    }

    const r = data.result || {};
    const shaped = {
      photos: (r.photos || []).slice(0, 6).map(
        (p) =>
          `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference=${p.photo_reference}&key=${GOOGLE_API_KEY}`
      ),
      reviews: rankReviews((r.reviews || []).slice(0, 5).map((rev) => ({
        author: rev.author_name,
        rating: rev.rating,
        text: rev.text,
        timeAgo: rev.relative_time_description,
      }))),
      hours: r.opening_hours?.weekday_text || [],
      openNow: r.opening_hours?.open_now,
      website: r.website || null,
      phone: r.formatted_phone_number || null,
      mapsUrl: r.url || null,
    };
    detailsCache.set(placeId, { data: shaped, cachedAt: Date.now() });
    persistDetailsCache();
    return shaped;
  } catch (e) {
    console.error('Place Details fetch failed', e);
    return null;
  }
}
