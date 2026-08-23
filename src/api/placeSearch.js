const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;

/**
 * Free-text restaurant search (Google Places Text Search), for manually
 * finding and adding a specific place by name - independent of
 * fetchLocalFood in places.js, which only ever searches by cuisine keyword
 * within a radius around the user. Used by PlaceSearchBar.js, shared by the
 * Favorites tab and the Journal ("My Reviews") screen, so a spot that was
 * never surfaced by a spin can still be favorited or reviewed.
 *
 * NOTE: this is a distinct Places API call (Text Search) this app didn't
 * make before - same product/billing tier as the Nearby Search/Place
 * Details/Place Photos endpoints already in use, but worth knowing it's a
 * new request type in case your API key has a restricted allow-list.
 */
export async function searchPlacesByName(query) {
  if (!GOOGLE_API_KEY || !query.trim()) return [];

  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(query)}` +
    `&type=restaurant` +
    `&key=${GOOGLE_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    console.warn('🚨 GOOGLE TEXT SEARCH ERROR 🚨:', data);
    return [];
  }

  return (data.results || []).slice(0, 8).map(shapeSearchResult);
}

// Google's generic top-level types ("restaurant"/"food"/etc.) aren't useful
// as a display label - same idea as getSpotLabel in places.js, just without
// needing that file's cuisine-keyword allowlist since this isn't a cuisine
// search.
const GENERIC_TYPES = new Set(['restaurant', 'food', 'point_of_interest', 'establishment']);

function shapeSearchResult(spot) {
  let photoUrl = null;
  if (spot.photos && spot.photos.length > 0) {
    const photoRef = spot.photos[0].photo_reference;
    photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoRef}&key=${GOOGLE_API_KEY}`;
  }
  const specificType = (spot.types || []).find((t) => !GENERIC_TYPES.has(t));

  return {
    id: spot.place_id,
    name: spot.name,
    rating: spot.rating || 'N/A',
    type: specificType ? specificType.replace(/_/g, ' ') : '',
    blurb: spot.user_ratings_total ? `${spot.user_ratings_total} reviews` : '',
    priceLevel: typeof spot.price_level === 'number' ? spot.price_level : null,
    lat: spot.geometry?.location?.lat,
    lng: spot.geometry?.location?.lng,
    photoUrl,
    address: spot.formatted_address || '',
  };
}
