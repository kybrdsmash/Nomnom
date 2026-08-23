import { SPEEDS_MPH } from '../constants';

/**
 * Haversine distance in miles between two lat/lng points.
 * Returns a string fixed to 1 decimal place (matches original app behavior).
 */
export function getTrueDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1);
}

/** Estimated max travel time in minutes for the current distance + travel type. */
export function estimateMaxTimeMinutes(distanceMiles, travelType) {
  const hours = distanceMiles / SPEEDS_MPH[travelType];
  return Math.round(hours * 60);
}

/** Estimated travel time in minutes for a specific trip distance + travel type. */
export function estimateTripTimeMinutes(tripDistanceMiles, travelType) {
  return Math.round((tripDistanceMiles / SPEEDS_MPH[travelType]) * 60) + 5;
}

/**
 * Pulls the most specific, non-generic Google Places "type" out of a types array,
 * e.g. ['restaurant', 'point_of_interest', 'mexican_restaurant'] -> 'MEXICAN RESTAURANT'.
 */
export function getSpecificType(types) {
  if (!types) return 'RESTAURANT';
  const generic = ['restaurant', 'food', 'point_of_interest', 'establishment'];
  const specific = types.find((t) => !generic.includes(t));
  return specific ? specific.replace(/_/g, ' ').toUpperCase() : 'RESTAURANT';
}
