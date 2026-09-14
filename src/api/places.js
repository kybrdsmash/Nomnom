import { SPEEDS_MPH, MIN_REVIEW_COUNT, STATS_FILTER_MIN_POOL, STATS_FILTER_SIGMA } from '../constants';
import { getTrueDistance, getSpecificType, estimateTripTimeMinutes } from '../utils/geo';
import { recordFeedPhotos } from './feedPhotos';

// EXPO_PUBLIC_ prefix means Expo bakes this in from your .env file (locally)
// or from EAS's environment variable store (in cloud builds).
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

// ---- Session result cache ----------------------------------------------
// Each Google pull returns up to 20 places but we only show 1 or 5, so we
// keep the whole shaped pool and serve later flips from it - most flips cost
// ZERO API calls. The cache resets whenever any filter changes (the key), and
// refetches only when the pool runs out of unshown spots.
let cachedPool = [];
let cachedKey = null;
let cacheShownIds = new Set();
// Total times each pool member has been served (fresh OR repeat) - persists
// across a full "everyone's been shown" cycle, unlike cacheShownIds (which
// resets every cycle), specifically so repeat-selection can prefer whichever
// spots have been shown LEAST overall. Before this, running low on fresh
// spots picked repeats uniformly at random every time, which meant pure luck
// decided whether the same handful of spots kept coming back-to-back (user
// report: "tons of repeats") instead of rotating fairly through the whole
// pool. Reset only when the pool itself is rebuilt (filters changed).
let cacheShowCounts = new Map();
// Which cuisines were selected as of the last fetchLocalFood call (any
// mode/cache outcome) - compared against the CURRENT selection on every
// call to detect a just-added cuisine (see forceCuisine in
// fetchLocalFood/pickFromPool below). Independent of the cache above on
// purpose: this needs to track "did the selection change" even across
// calls that hit the cache for other reasons.
let lastSelectedCuisines = [];

function makeFilterKey({ location, distance, minRating, selectedCuisines, travelType, openNowOnly, maxPrice }) {
  // Location rounded to ~100m so tiny GPS drift doesn't nuke the cache.
  const lat = location.latitude.toFixed(3);
  const lng = location.longitude.toFixed(3);
  return JSON.stringify({
    lat, lng, distance, minRating,
    cuisines: [...selectedCuisines].sort(),
    travelType, openNowOnly, maxPrice,
  });
}

// Google only hands back ~20 results per page even when up to 60 (3 pages)
// are actually available for a popular area/keyword - fetching those extra
// pages is what actually grows the pool with genuinely DIFFERENT places
// (user question: does a fresh API pull even mean new places? A plain
// re-request with the same params doesn't - nearbysearch isn't randomized,
// you'd get the identical page 1 back - but pages 2/3 are real, distinct
// results we simply never asked for before). A next_page_token needs a
// short server-side delay before Google will accept it - too soon and the
// request comes back INVALID_REQUEST, so this waits before each one rather
// than firing immediately.
const NEXT_PAGE_DELAY_MS = 2000;
const MAX_PAGES = 3; // Google's own cap - 20 results/page, 60 total

async function fetchPlacesPage(url) {
  const response = await fetch(url);
  return response.json();
}

/** Runs ONE nearbysearch request for a single keyword, following pagination
 * up to Google's cap, and returns raw results. */
async function searchOnce({ location, radiusInMeters, keyword, openNowOnly }) {
  const baseUrl =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${location.latitude},${location.longitude}` +
    `&radius=${radiusInMeters}` +
    `&type=restaurant` +
    `&keyword=${encodeURIComponent(keyword)}` +
    (openNowOnly ? `&opennow=true` : '') +
    `&key=${GOOGLE_API_KEY}`;

  let data = await fetchPlacesPage(baseUrl);
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.warn('🚨 GOOGLE API ERROR 🚨:', data);
    throw new Error(data.status);
  }
  let allRaw = data.results || [];

  let pagesFetched = 1;
  while (data.next_page_token && pagesFetched < MAX_PAGES) {
    await new Promise((resolve) => setTimeout(resolve, NEXT_PAGE_DELAY_MS));
    // Per Google's docs, supplying pagetoken makes every other param
    // (including opennow) redundant - the token already encodes the
    // original request server-side.
    const pageUrl =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?pagetoken=${data.next_page_token}` +
      `&key=${GOOGLE_API_KEY}`;
    data = await fetchPlacesPage(pageUrl);
    // A token that's not ready yet comes back INVALID_REQUEST even after
    // the delay, occasionally - stop rather than throw, keeping whatever
    // pages already succeeded instead of losing the whole search over one
    // slow-to-activate token.
    if (data.status !== 'OK') break;
    allRaw = allRaw.concat(data.results || []);
    pagesFetched += 1;
  }

  // Tag each raw result with the cuisine keyword that found it, so labeling
  // can fall back to it when Google's type list is unhelpfully generic.
  const tagged = allRaw.map((r) => ({ ...r, _searchCuisine: keyword }));
  // Google's `keyword` param is a loose full-text match against name/type/
  // reviews, not a guarantee the place actually IS that cuisine (user
  // feedback: a fried-chicken spot surfaced for a "Dessert" search, a liquor
  // store surfaced labeled as a restaurant). Where we know Google's real
  // place-type taxonomy for a cuisine, require the result to actually carry
  // one of those types.
  return applyTypeAllowlist(tagged, keyword.replace(/ food$/, ''));
}

/**
 * Fetches restaurants matching the current filters and shapes them into the
 * app's spot format.
 *
 * Multi-cuisine handling (from user feedback): Google rejects combined
 * keywords like "Mexican Thai food", so with multiple cuisines selected we now
 * run one search PER cuisine in parallel and interleave the results - that's
 * what makes a 5-item Elimination bracket genuinely diverse instead of five
 * spots from one randomly-chosen cuisine.
 */
export async function fetchLocalFood({
  location,
  distance,
  minRating,
  selectedCuisines,
  travelType,
  count = 1,
  openNowOnly = false,
  maxPrice = null,
  // List mode wants "up to `count`, whatever's actually left in the pool" on
  // a refresh - not padded out with repeats the way a single flip or an
  // elimination bracket wants a full, consistent-sized set every time.
  allowRepeats = true,
}) {
  if (!GOOGLE_API_KEY) {
    alert('Missing Google API key - check your .env file has EXPO_PUBLIC_GOOGLE_API_KEY set.');
    return [];
  }

  // A cuisine that's newly selected since the LAST call (any outcome, cache
  // hit or miss) gets guaranteed into the very first pick below - switching
  // filters should give immediate, visible confirmation it actually took
  // effect (user request), rather than possibly waiting several spins
  // before that cuisine's turn comes up in the normal rotation. Picked at
  // random when more than one cuisine was added since the last call (e.g.
  // several toggled before spinning again). Computed once per call, before
  // any cache branch below, and only ever applied to each branch's FIRST
  // pickFromPool call - a second call in the same branch (repeat top-up) is
  // filling leftover slots, not confirming a new filter.
  const newlyAddedCuisines = selectedCuisines.filter((c) => !lastSelectedCuisines.includes(c));
  lastSelectedCuisines = [...selectedCuisines];
  const forceCuisine = newlyAddedCuisines.length > 0
    ? newlyAddedCuisines[Math.floor(Math.random() * newlyAddedCuisines.length)]
    : null;

  // Serve from cache when filters haven't changed. Fresh (never-shown) spots
  // are ALWAYS used first; repeats only fill the remainder once fresh ones
  // run short, and only then does shown-tracking reset.
  const filterKey = makeFilterKey({ location, distance, minRating, selectedCuisines, travelType, openNowOnly, maxPrice });
  if (filterKey === cachedKey && cachedPool.length > 0) {
    const unshown = cachedPool.filter((s) => !cacheShownIds.has(s.id));
    if (unshown.length >= count) {
      return pickFromPool(unshown, count, { forceCuisine });
    }
    if (!allowRepeats) {
      // Whole pool already shown this cycle: starting the no-repeat cycle
      // over (instead of returning nothing) so Curated mode doesn't go
      // permanently blank on every spin after the pool's first pass.
      if (unshown.length === 0) {
        cacheShownIds = new Set();
        return pickFromPool(cachedPool, Math.min(count, cachedPool.length), { forceCuisine });
      }
      return pickFromPool(unshown, unshown.length, { forceCuisine });
    }
    // Not enough fresh spots for a full set: use every fresh one, then top up
    // with repeats. Reset shown-tracking so the cycle starts over after this.
    const freshPicks = pickFromPool(unshown, unshown.length, { forceCuisine });
    const repeatCandidates = cachedPool.filter(
      (s) => !freshPicks.find((f) => f.id === s.id)
    );
    cacheShownIds = new Set(freshPicks.map((s) => s.id));
    const topUp = pickFromPool(repeatCandidates, count - freshPicks.length);
    return [...freshPicks, ...topUp];
  }

  // Cache miss (first search, or a filter changed): do the real fetch.
  const radiusInMeters = Math.round(distance * 1609.34);

  // One search per selected cuisine (capped at 5 parallel calls), or a single
  // generic search if none selected. We fetch ALL cuisines even in randomizer
  // mode - it costs more up front but fills the pool so later flips are free.
  let keywords;
  if (selectedCuisines.length === 0) {
    keywords = ['food'];
  } else {
    const shuffledCuisines = [...selectedCuisines].sort(() => 0.5 - Math.random());
    keywords = shuffledCuisines.slice(0, 5).map((c) => `${c} food`);
  }

  let allResults;
  try {
    const resultsPerKeyword = await Promise.all(
      keywords.map((keyword) =>
        searchOnce({ location, radiusInMeters, keyword, openNowOnly }).catch(() => [])
      )
    );
    // Interleave results round-robin (first result of each cuisine, then
    // second of each, ...) so the top of the pool is cuisine-diverse.
    allResults = [];
    const maxLen = Math.max(...resultsPerKeyword.map((r) => r.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const list of resultsPerKeyword) {
        if (list[i]) allResults.push(list[i]);
      }
    }
  } catch (error) {
    console.error(error);
    alert('Network Error. Check your internet connection.');
    return [];
  }

  if (allResults.length === 0) {
    alert(
      openNowOnly
        ? `No spots open right now in this radius. Try turning off "Open now" or widening your search.`
        : `Literally 0 spots found. Try widening your search.`
    );
    return [];
  }

  // De-duplicate across cuisine searches (same place can match two keywords),
  // drop places Google marks as temporarily/permanently closed, and drop
  // anything that's clearly not a food business at all regardless of which
  // cuisine keyword happened to match it (liquor stores, gas stations, etc).
  //
  // With multiple cuisines selected, the SAME place can turn up once as a
  // genuine confirmed match for one cuisine and once as an unconfirmed
  // fallback result for another (e.g. it's a real mexican_restaurant, but
  // also got swept into a separate "Italian" search's fallback because that
  // search found zero real Italian matches anywhere nearby - see
  // applyTypeAllowlist). A plain first-wins dedup could keep either copy
  // depending purely on interleaving order, which could silently attach the
  // wrong cuisine's "unconfirmed" flag to a place that's a perfectly
  // confirmed match under its OTHER copy (user report: a clearly-correct
  // result still showing "No confirmed X spots nearby"). Prefer a confirmed
  // copy over an unconfirmed one whenever both exist for the same place.
  const byId = new Map();
  for (const spot of allResults) {
    if (spot.business_status && spot.business_status !== 'OPERATIONAL') continue;
    if ((spot.types || []).some((t) => NON_FOOD_TYPES.has(t))) continue;
    const existing = byId.get(spot.place_id);
    if (!existing || (existing._unconfirmedCuisine && !spot._unconfirmedCuisine)) {
      byId.set(spot.place_id, spot);
    }
  }
  const dedupedById = [...byId.values()];

  // Same chain appearing at multiple nearby locations (multiple Taco Bells,
  // multiple In-N-Outs) reads as repetitive, low-effort results (user
  // request: "should not repeat the same establishment"). Keep only the
  // CLOSEST location of each distinct establishment name and drop the rest -
  // on the raw pool (not just what's about to be shown), so a dropped
  // farther-away duplicate is naturally replaced by some other, genuinely
  // different place already sitting in the same fetched pool, rather than
  // needing a second search to "backfill" the slot. No opt-out setting for
  // this yet (user: "don't see the benefit as of right now") - straight
  // dedup, always on.
  const closestByName = new Map();
  for (const spot of dedupedById) {
    const key = spot.name.trim().toLowerCase();
    const distance = getTrueDistance(
      location.latitude,
      location.longitude,
      spot.geometry.location.lat,
      spot.geometry.location.lng
    );
    const existing = closestByName.get(key);
    if (!existing || parseFloat(distance) < parseFloat(existing._chainDistance)) {
      closestByName.set(key, { ...spot, _chainDistance: distance });
    }
  }
  const deduped = [...closestByName.values()];

  // Basic quality filter: minimum star rating + hard review floor backstop.
  // Price is also filtered here (client-side) rather than via Google's own
  // `minprice`/`maxprice` request params, which only express a RANGE anyway -
  // Google has no "exact price level" request param, and using its params
  // would also exclude any place with no recorded price_level at all, which
  // silently craters the pool since plenty of legitimate spots never report
  // one. `maxPrice` here is actually an EXACT price level to match (1-4,
  // despite the name) - user request: tapping "$$" should mean only $$
  // places, not "$$ or cheaper". First tried excluding unpriced spots
  // entirely for a stricter exact match, but that turned out to genuinely
  // empty out results in practice (user report: "$ filters don't end up
  // completing any search results") - Google just doesn't populate
  // price_level for a lot of real businesses, so requiring it crossed from
  // "stricter" into "broken". Unpriced spots pass through again, same
  // reasoning as the original ceiling filter: don't punish a legitimate
  // place for data Google never recorded.
  const basicValid = deduped.filter(
    (spot) =>
      spot.rating &&
      spot.rating >= minRating &&
      (spot.user_ratings_total || 0) >= MIN_REVIEW_COUNT &&
      (!maxPrice || !spot.price_level || spot.price_level === maxPrice)
  );

  // Statistical filter (user-designed): drop places whose review count falls
  // more than STATS_FILTER_SIGMA std deviations below the local mean of
  // log(review count). Log-scale because review counts are heavily skewed -
  // one 8,000-review anchor would wreck a raw mean. This self-calibrates: in
  // a city the effective floor might be ~200 reviews, rural might be ~15.
  // Skipped entirely for small pools where the stats would just be noise.
  const validSpots = filterByReviewStats(basicValid);

  if (validSpots.length === 0) {
    alert(
      `No well-reviewed spots with ${minRating.toFixed(1)}+ stars in this radius. Try widening your search.`
    );
    return [];
  }

  // Sort by review count so the most-vetted spots surface first (user
  // feedback: review volume beats a marginally higher star rating).
  validSpots.sort((a, b) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0));

  // Shape the ENTIRE valid pool (not just what we're about to show) and cache
  // it, so subsequent flips with the same filters cost zero API calls.
  cachedPool = validSpots.map((spot) => shapeSpot(spot, location, travelType));
  cachedKey = filterKey;
  cacheShownIds = new Set();
  cacheShowCounts = new Map();
  recordFeedPhotos(cachedPool);

  return pickFromPool(cachedPool, count, { forceCuisine });
}

// Groups a pool by which cuisine filter it's confirmed to match
// (spot.confirmedCuisine, see shapeSpot), or a shared "other" bucket for
// unconfirmed-cuisine spots and anything found with no cuisine filter
// active. This is what lets pickFromPool treat each ACTIVE FILTER as an
// equally-likely draw regardless of how many raw results Google happened
// to return for it - a flat pick across the combined pool silently favored
// whichever cuisine had the most (or best-reviewed) spots (user report:
// "kept only getting options from the first filter" once a second cuisine
// was added). With no cuisine filter selected, every spot shares the same
// bucket and this is identical to a plain flat pick, same as before.
function groupByCuisine(pool) {
  const groups = new Map();
  for (const spot of pool) {
    const key = spot.confirmedCuisine || '__other__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(spot);
  }
  return groups;
}

// Least-shown first within one cuisine group, randomized within each tied
// show-count tier - same fairness rule pickFromPool always used, just
// scoped to one cuisine's slice of the pool now instead of the whole thing.
function leastShownFirst(candidates) {
  return [...candidates].sort((a, b) => {
    const diff = (cacheShowCounts.get(a.id) || 0) - (cacheShowCounts.get(b.id) || 0);
    return diff !== 0 ? diff : Math.random() - 0.5;
  });
}

/**
 * Picks `count` spots from a pool and records them as shown so the next
 * flip serves fresh options.
 *
 * Each pick independently draws a uniformly-random ACTIVE cuisine (from
 * whichever cuisines are still represented among not-yet-picked spots),
 * then takes the least-shown spot within it - so representation stays
 * roughly 1/N per active filter as more filters stack up, rather than
 * degrading toward whichever cuisine returned the most results (user
 * request). `forceCuisine`, when given, guarantees the FIRST pick is that
 * cuisine specifically - used to confirm a just-added filter actually took
 * effect on the very next spin, rather than waiting for its turn in the
 * normal random rotation (user request).
 */
function pickFromPool(pool, count, { forceCuisine } = {}) {
  const groups = groupByCuisine(pool);
  const cuisineKeys = [...groups.keys()];
  const picked = [];
  const pickedIds = new Set();

  const pickOneFrom = (key) => {
    const candidates = (groups.get(key) || []).filter((s) => !pickedIds.has(s.id));
    if (candidates.length === 0) return null;
    return leastShownFirst(candidates)[0];
  };

  if (forceCuisine && groups.has(forceCuisine)) {
    const spot = pickOneFrom(forceCuisine);
    if (spot) { picked.push(spot); pickedIds.add(spot.id); }
  }

  // Bounded by cuisineKeys.length * count (worst case: every remaining pick
  // needs to cycle through every group once before finding one with a spot
  // left) rather than an unbounded while - a plain safety margin, not a
  // tuned value.
  const maxAttempts = count * (cuisineKeys.length + 1) + 10;
  for (let attempts = 0; picked.length < count && attempts < maxAttempts; attempts++) {
    const availableKeys = cuisineKeys.filter((k) =>
      (groups.get(k) || []).some((s) => !pickedIds.has(s.id))
    );
    if (availableKeys.length === 0) break;
    const key = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    const spot = pickOneFrom(key);
    if (spot) { picked.push(spot); pickedIds.add(spot.id); }
  }

  picked.forEach((s) => {
    cacheShownIds.add(s.id);
    cacheShowCounts.set(s.id, (cacheShowCounts.get(s.id) || 0) + 1);
  });
  return picked;
}

/** Shapes one raw Google result into the app's spot format. */
function shapeSpot(spot, location, travelType) {
  let photoUrl = null;
  if (spot.photos && spot.photos.length > 0) {
    const photoRef = spot.photos[0].photo_reference;
    photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${GOOGLE_API_KEY}`;
  }

  const spotLat = spot.geometry.location.lat;
  const spotLng = spot.geometry.location.lng;
  const trueDistanceStr = getTrueDistance(
    location.latitude,
    location.longitude,
    spotLat,
    spotLng
  );
  const trueTimeMins = estimateTripTimeMinutes(parseFloat(trueDistanceStr), travelType);
  const classification = classifySpot(spot);

  const totalReviews = spot.user_ratings_total
    ? `${spot.user_ratings_total} reviews`
    : 'No reviews';
  // Omit price entirely when Google has no price_level for this place -
  // a "?" placeholder is less useful than just not mentioning it (user
  // feedback: less relevant info is worse than no info).
  const blurb = spot.price_level ? `${'$'.repeat(spot.price_level)} • ${totalReviews}` : totalReviews;

  return {
    id: spot.place_id,
    name: spot.name,
    rating: spot.rating || 'N/A',
    reviewCount: spot.user_ratings_total || 0,
    type: classification.label,
    // Which cuisine this spot was NOT confirmed to actually be (see
    // classifySpot below), or null when it's a genuine match / confirmed by
    // a different signal / no cuisine filter was active to begin with. Lets
    // result screens flag "closest options, not confirmed X" instead of
    // silently presenting a fallback result as if it were a real match.
    unconfirmedCuisine: classification.unconfirmedCuisine,
    // The flip side: which cuisine this spot WAS actually confirmed to
    // match (the keyword that found it, when this result wasn't a
    // fallback and a real cuisine filter was active) - null for an
    // unconfirmed spot, or when no cuisine filter was in play to begin
    // with. BrowseList groups confirmed spots under a "[Cuisine] Spots
    // Nearby" banner using this - unconfirmed spots use unconfirmedCuisine
    // above instead and never get grouped by a specific cuisine (user
    // request: don't claim a cuisine for a result that isn't confirmed).
    confirmedCuisine:
      !classification.unconfirmedCuisine && spot._searchCuisine && spot._searchCuisine !== 'food'
        ? spot._searchCuisine.replace(/ food$/, '')
        : null,
    blurb,
    // Raw 0-4 level (Google's legacy Places API scale), kept separately from
    // the blurb's compact "$$" string so the detail view can show a proper
    // labeled price section instead of parsing it back out of that string.
    // null when Google hasn't recorded a price for this place at all.
    priceLevel: typeof spot.price_level === 'number' ? spot.price_level : null,
    distance: `${trueDistanceStr} mi`,
    travel: travelType,
    time: `${trueTimeMins} min`,
    // Rough street address (Google's "vicinity" field) - used as the
    // location on a generated "add to calendar" link for friend-spin's
    // schedule-a-meal step.
    address: spot.vicinity || '',
    photoUrl,
    lat: spotLat,
    lng: spotLng,
  };
}

/**
 * Statistical review-count filter. Computes mean and std deviation of
 * log(review count) and drops anything more than STATS_FILTER_SIGMA below
 * the mean. Only runs when the pool is big enough for the stats to mean
 * something; otherwise passes everything through.
 *
 * Run PER CUISINE (grouped by `_searchCuisine`, still present on these raw
 * results - see searchOnce), not once across the whole combined pool - a
 * single global mean/stddev meant one cuisine's typically-higher review
 * counts could pull the cutoff up past what's normal for a DIFFERENT,
 * legitimately-lower-review-count cuisine also in the mix, silently
 * wiping out that second cuisine's entire result set (user report: "used
 * one filter, worked well... used one more filter, kept only getting
 * options from the first filter"). Each cuisine's own local distribution
 * now sets its own bar, same self-calibration the filter was always meant
 * to do, just correctly scoped. With no cuisine filter active (or only
 * one), every spot shares the same `_searchCuisine` and this is identical
 * to the old single-group behavior.
 */
function filterByReviewStats(spots) {
  const groups = new Map();
  for (const spot of spots) {
    const key = spot._searchCuisine || 'food';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(spot);
  }
  const result = [];
  for (const group of groups.values()) {
    result.push(...filterGroupByReviewStats(group));
  }
  return result;
}

function filterGroupByReviewStats(spots) {
  if (spots.length < STATS_FILTER_MIN_POOL) return spots;

  const logs = spots.map((s) => Math.log(s.user_ratings_total || 1));
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const variance = logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length;
  const stdDev = Math.sqrt(variance);

  // Degenerate case: all counts nearly identical - nothing to filter on.
  if (stdDev < 0.01) return spots;

  const cutoff = mean - STATS_FILTER_SIGMA * stdDev;
  const filtered = spots.filter(
    (s) => Math.log(s.user_ratings_total || 1) >= cutoff
  );

  // Safety: never let the filter empty this cuisine's slice below a usable size.
  return filtered.length >= 5 ? filtered : spots;
}

// Google "types" that tell the user nothing about what kind of food it is.
const JUNK_TYPES = new Set([
  'restaurant', 'food', 'point_of_interest', 'establishment',
  'meal_delivery', 'meal_takeaway', 'store', 'bar', 'cafe',
]);

// Places that should never be shown no matter which cuisine keyword matched
// them - Google's `keyword` search is a loose full-text match (name/type/
// reviews), so a liquor store or gas station can surface and, since
// `liquor_store` isn't in JUNK_TYPES, get labeled as if it were a restaurant.
const NON_FOOD_TYPES = new Set([
  'liquor_store', 'convenience_store', 'grocery_or_supermarket', 'supermarket',
  'gas_station', 'lodging', 'night_club', 'casino', 'movie_theater',
  'shopping_mall', 'department_store', 'drugstore', 'pharmacy',
]);

// Google's full "Food and Drink" place-type taxonomy (Places API Table A),
// kept here for reference so extending CUISINES later means checking this
// list rather than guessing: acai_shop, afghani_restaurant,
// african_restaurant, american_restaurant, asian_restaurant, bagel_shop,
// bakery, bar, bar_and_grill, barbecue_restaurant, brazilian_restaurant,
// breakfast_restaurant, brunch_restaurant, buffet_restaurant, cafe,
// cafeteria, candy_store, cat_cafe, chinese_restaurant, chocolate_factory,
// chocolate_shop, coffee_shop, confectionery, deli, dessert_restaurant,
// dessert_shop, diner, dog_cafe, donut_shop, fast_food_restaurant,
// fine_dining_restaurant, food_court, french_restaurant, greek_restaurant,
// hamburger_restaurant, ice_cream_shop, indian_restaurant,
// indonesian_restaurant, italian_restaurant, japanese_restaurant,
// juice_shop, korean_restaurant, lebanese_restaurant, meal_delivery,
// meal_takeaway, mediterranean_restaurant, mexican_restaurant,
// middle_eastern_restaurant, pizza_restaurant, pub, ramen_restaurant,
// restaurant, sandwich_shop, seafood_restaurant, spanish_restaurant,
// steak_house, sushi_restaurant, tea_house, thai_restaurant,
// turkish_restaurant, vegan_restaurant, vegetarian_restaurant,
// vietnamese_restaurant, wine_bar.
//
// For cuisines with a matching type in that list, require a result to
// actually carry one of these - the `keyword` param alone isn't enough (a
// fried-chicken spot surfaced for a "Dessert" search purely because a review
// mentioned their dessert menu). CUISINES (constants.js) was rebuilt to be
// exactly Google's cuisine-specific + cafes/drinks/sweets types (user
// request: "use the Google specific labels across the board"), so every
// single entry now has a real, confident backing type here - unlike the
// old list, nothing falls back to keyword-only matching anymore. Some
// broader regional categories (Japanese, Middle Eastern) deliberately still
// include their narrower siblings' types too (sushi/ramen under Japanese,
// Lebanese/Turkish under Middle Eastern) even though those are now ALSO
// their own separate filter options - "Japanese food" should still mean
// "including sushi and ramen," the same way it always has; the narrower
// options exist for someone who wants to be more specific, not to replace
// the broader search.
const CUISINE_TYPE_REQUIREMENTS = {
  Acai: ['acai_shop'],
  Afghani: ['afghani_restaurant'],
  African: ['african_restaurant'],
  American: ['american_restaurant'],
  Asian: ['asian_restaurant'],
  Bagels: ['bagel_shop'],
  Bakery: ['bakery'],
  BBQ: ['barbecue_restaurant'],
  Brazilian: ['brazilian_restaurant'],
  Burgers: ['hamburger_restaurant'],
  Cafe: ['cafe'],
  Candy: ['candy_store', 'confectionery'],
  Chinese: ['chinese_restaurant'],
  Chocolate: ['chocolate_shop', 'chocolate_factory'],
  Coffee: ['coffee_shop'],
  Deli: ['deli'],
  Dessert: ['dessert_shop', 'dessert_restaurant'],
  Diner: ['diner'],
  Donuts: ['donut_shop'],
  French: ['french_restaurant'],
  Greek: ['greek_restaurant'],
  'Ice Cream': ['ice_cream_shop'],
  Indian: ['indian_restaurant'],
  Indonesian: ['indonesian_restaurant'],
  Italian: ['italian_restaurant'],
  Japanese: ['japanese_restaurant', 'sushi_restaurant', 'ramen_restaurant'],
  Juice: ['juice_shop'],
  Korean: ['korean_restaurant'],
  Lebanese: ['lebanese_restaurant'],
  Mediterranean: ['mediterranean_restaurant'],
  Mexican: ['mexican_restaurant'],
  'Middle Eastern': ['middle_eastern_restaurant', 'lebanese_restaurant', 'turkish_restaurant'],
  Pizza: ['pizza_restaurant'],
  Ramen: ['ramen_restaurant'],
  Sandwiches: ['sandwich_shop'],
  Seafood: ['seafood_restaurant'],
  Spanish: ['spanish_restaurant'],
  Sushi: ['sushi_restaurant'],
  Tea: ['tea_house'],
  Thai: ['thai_restaurant'],
  Turkish: ['turkish_restaurant'],
  Vegan: ['vegan_restaurant'],
  Vegetarian: ['vegetarian_restaurant'],
  Vietnamese: ['vietnamese_restaurant'],
};

/**
 * Filters one cuisine's raw results down to ones that actually carry a type
 * matching that cuisine, when we have a confident type list for it. Falls
 * back to the unfiltered list if that would wipe out every result - e.g. if
 * there's genuinely no match for this cuisine anywhere in the radius -
 * rather than starving the pool on a bad assumption (same safety pattern as
 * filterByReviewStats below). Those fallback results get `_unconfirmedCuisine:
 * true` so classifySpot below never claims one of them actually IS this
 * cuisine (user report: an Indian restaurant with no specific Google type
 * label displayed as "BRAZILIAN", a burger place as "AFRICAN" - both were
 * this exact fallback path, mislabeled with the search keyword instead of
 * being left honestly unlabeled).
 */
function applyTypeAllowlist(results, cuisineLabel) {
  const requirement = CUISINE_TYPE_REQUIREMENTS[cuisineLabel];
  if (!requirement) return results;
  const matched = results.filter((r) => (r.types || []).some((t) => requirement.includes(t)));
  if (matched.length > 0) return matched;
  return results.map((r) => ({ ...r, _unconfirmedCuisine: true }));
}

// Last-resort cuisine guess from the place's NAME, used only when Google
// gave us nothing better (no specific type, no cuisine filter active to fall
// back on). User feedback: a clearly-Italian place with no `italian_restaurant`
// type and no cuisine filter selected just showed "RESTAURANT" - Google
// doesn't tag every listing with the granular type, and with no cuisine
// filter there's no search keyword to fall back on either. This costs zero
// extra API calls (pure string matching on data already fetched), so it's a
// free improvement rather than the "call Place Details for every pool item"
// approach, which would multiply the API cost per search.
const NAME_HINTS = {
  Acai: ['acai', 'açai'],
  Afghani: ['afghan', 'afghani'],
  African: ['ethiopian', 'nigerian', 'eritrean', 'african'],
  Asian: ['pan-asian', 'pan asian', 'asian fusion'],
  Bagels: ['bagel'],
  Bakery: ['bakery', 'patisserie', 'bakeshop'],
  BBQ: ['bbq', 'barbecue', 'smokehouse'],
  Brazilian: ['brazilian', 'churrascaria', 'rodizio'],
  Burgers: ['burger', 'hamburger'],
  Candy: ['candy', 'confectionery', 'sweet shop'],
  Chinese: ['chinese', 'dim sum', 'szechuan', 'sichuan', 'cantonese'],
  Chocolate: ['chocolate', 'chocolatier', 'cacao'],
  Coffee: ['coffee', 'espresso', 'roasters', 'roastery'],
  Deli: ['deli', 'delicatessen'],
  Dessert: ['dessert', 'creamery', 'cupcake', 'patisserie'],
  Diner: ['diner'],
  Donuts: ['donut', 'doughnut'],
  French: ['french', 'bistro', 'brasserie'],
  Greek: ['greek', 'gyro', 'taverna', 'souvlaki'],
  'Ice Cream': ['ice cream', 'gelato', 'frozen yogurt', 'froyo'],
  Indian: ['indian', 'tandoori', 'punjabi', 'masala'],
  Indonesian: ['indonesian', 'satay', 'nasi goreng'],
  Italian: ['italian', 'pizzeria', 'trattoria', 'ristorante', 'osteria'],
  Japanese: ['japanese', 'sushi', 'ramen', 'izakaya', 'hibachi'],
  Juice: ['juice', 'smoothie'],
  Korean: ['korean', 'k-bbq', 'kbbq', 'bibimbap'],
  Lebanese: ['lebanese'],
  Mediterranean: ['mediterranean'],
  Mexican: ['mexican', 'taqueria', 'cantina', 'taco'],
  'Middle Eastern': ['shawarma', 'falafel', 'persian', 'middle eastern'],
  Pizza: ['pizza', 'pizzeria'],
  Ramen: ['ramen'],
  Sandwiches: ['sandwich', 'sub shop', 'hoagie'],
  Seafood: ['seafood', 'oyster', 'crab shack'],
  Spanish: ['spanish', 'tapas', 'paella'],
  Sushi: ['sushi'],
  Tea: ['tea house', 'bubble tea', 'boba'],
  Thai: ['thai', 'pad thai'],
  Turkish: ['turkish', 'kebab'],
  Vegan: ['vegan', 'plant-based', 'plant based'],
  Vegetarian: ['vegetarian'],
  Vietnamese: ['vietnamese', 'pho', 'banh mi'],
};

function guessCuisineFromName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const [cuisine, hints] of Object.entries(NAME_HINTS)) {
    if (hints.some((h) => lower.includes(h))) return cuisine;
  }
  return null;
}

/**
 * Better sub-genre labeling (user feedback: "keeps labeling restaurant,
 * delivery, etc"). Prefers a specific Google type (e.g. mexican_restaurant),
 * falls back to the cuisine keyword the search used, then a name-based
 * guess. Label is '' (not a generic "RESTAURANT" placeholder) when none of
 * those pan out - a non-specific label is less useful than no label at all
 * (user feedback), and every display site treats an empty type as "omit
 * this part" rather than showing an empty/meaningless bullet point.
 *
 * Label and unconfirmed-cuisine status are decided TOGETHER here, not as two
 * independently-computed fields, on purpose - they used to be separate, and
 * a name-based guess could re-identify a cuisine the strict type-allowlist
 * check couldn't confirm, leaving the two out of sync: a place correctly
 * labeled "BRAZILIAN" (via its name) while ALSO showing a "no confirmed
 * Brazilian spots nearby" note right next to it (user report - a genuinely
 * Brazilian place got flagged as unconfirmed anyway). Now a name-guess that
 * lands on the SAME cuisine the type-check couldn't confirm counts as
 * confirmed - it's a real identification via a different signal, not a
 * consolation label slapped on top of a still-unconfirmed result.
 */
function classifySpot(spot) {
  const specific = (spot.types || []).find((t) => !JUNK_TYPES.has(t));
  if (specific) {
    return { label: specific.replace(/_/g, ' ').toUpperCase(), unconfirmedCuisine: null };
  }

  const nameGuess = guessCuisineFromName(spot.name);
  const searchCuisine = spot._searchCuisine && spot._searchCuisine !== 'food'
    ? spot._searchCuisine.replace(/ food$/, '')
    : null;

  if (spot._unconfirmedCuisine) {
    if (nameGuess && searchCuisine && nameGuess.toLowerCase() === searchCuisine.toLowerCase()) {
      return { label: nameGuess.toUpperCase(), unconfirmedCuisine: null };
    }
    // Not reconciled - still show whatever positive ID we have (if any), but
    // keep the unconfirmed flag for the ORIGINAL searched cuisine, since
    // that's what the "no confirmed X nearby" note needs to name.
    return { label: nameGuess ? nameGuess.toUpperCase() : '', unconfirmedCuisine: searchCuisine };
  }

  if (searchCuisine) return { label: searchCuisine.toUpperCase(), unconfirmedCuisine: null };
  if (nameGuess) return { label: nameGuess.toUpperCase(), unconfirmedCuisine: null };
  return { label: '', unconfirmedCuisine: null };
}

// How close two candidates' distances have to be (miles) to count as
// "basically tied for closest" rather than one being the clear winner - see
// closestOnly below.
const NEARBY_TIE_THRESHOLD_MILES = 0.1;

/**
 * Nearby Search for a specific dish/food item by free text - e.g. "fried
 * chicken", or a rolling-strip food's name - rather than one of the fixed
 * CUISINES keywords fetchLocalFood searches by. Reuses the same
 * already-enabled/paid Nearby Search endpoint and spot shaping this file's
 * normal search already uses (not a new API surface), just with an
 * arbitrary keyword and no cuisine allowlist (that allowlist is keyed to
 * the known CUISINES list, not free text). Used by the Cuisines dropdown's
 * dish-search field (sorted by review count, default behavior) and
 * FoodDetailModal's "find it nearby" button (`closestOnly: true` - sorted
 * by distance instead, deduped by chain - see below).
 */
export async function searchNearbyByKeyword(location, travelType, keyword, { radiusMiles = 10, closestOnly = false } = {}) {
  if (!GOOGLE_API_KEY || !location || !keyword.trim()) return [];

  const radiusInMeters = Math.round(radiusMiles * 1609.34);
  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${location.latitude},${location.longitude}` +
    `&radius=${radiusInMeters}` +
    `&type=restaurant` +
    `&keyword=${encodeURIComponent(keyword.trim())}` +
    `&key=${GOOGLE_API_KEY}`;

  let data;
  try {
    const response = await fetch(url);
    data = await response.json();
  } catch (e) {
    console.warn('🚨 GOOGLE NEARBY-KEYWORD SEARCH NETWORK ERROR 🚨:', e);
    return [];
  }
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.warn('🚨 GOOGLE NEARBY-KEYWORD SEARCH ERROR 🚨:', data);
    return [];
  }

  const results = (data.results || []).filter((spot) => {
    if (spot.business_status && spot.business_status !== 'OPERATIONAL') return false;
    if ((spot.types || []).some((t) => NON_FOOD_TYPES.has(t))) return false;
    return true;
  });
  if (results.length === 0) return [];

  // FoodDetailModal's "Find X Near Me": still a browsable list ("it should
  // be showing many more like before" - user correction after an earlier
  // pass collapsed this to a single result, which turned out to be more
  // than was actually wanted), just ordered by distance instead of review
  // count, deduped by chain, and with near-ties broken by reviews.
  if (closestOnly) {
    // Same chain at multiple nearby locations reads as a repeat, not a
    // second real option (user request: "no repeats") - mirrors
    // fetchLocalFood's closestByName dedup, keeping only the closest branch
    // of each distinct name.
    const closestByName = new Map();
    for (const spot of results) {
      const key = spot.name.trim().toLowerCase();
      const dist = parseFloat(getTrueDistance(
        location.latitude, location.longitude,
        spot.geometry.location.lat, spot.geometry.location.lng
      ));
      const existing = closestByName.get(key);
      if (!existing || dist < existing.dist) {
        closestByName.set(key, { spot, dist });
      }
    }
    const deduped = [...closestByName.values()];

    // Closest-first overall, but two spots within NEARBY_TIE_THRESHOLD_MILES
    // of each other are treated as tied for that position and ordered by
    // review count instead (user request). Bucketing distance into
    // NEARBY_TIE_THRESHOLD_MILES-wide steps first (rather than a raw
    // epsilon comparator) keeps the sort a proper total order across the
    // whole list, not just correct for whichever pair happens to be
    // compared first.
    deduped.sort((a, b) => {
      const bucketA = Math.round(a.dist / NEARBY_TIE_THRESHOLD_MILES);
      const bucketB = Math.round(b.dist / NEARBY_TIE_THRESHOLD_MILES);
      if (bucketA !== bucketB) return bucketA - bucketB;
      return (b.spot.user_ratings_total || 0) - (a.spot.user_ratings_total || 0);
    });
    return deduped.slice(0, 8).map(({ spot }) => shapeSpot(spot, location, travelType));
  }

  // Most-reviewed first - same "review volume beats a marginally higher
  // rating" logic fetchLocalFood uses.
  results.sort((a, b) => (b.user_ratings_total || 0) - (a.user_ratings_total || 0));

  return results.slice(0, 8).map((spot) => shapeSpot(spot, location, travelType));
}
