import { useWindowDimensions } from 'react-native';
import { hexToHsl, hslToHex } from './utils/color';

// Real https domain (Firebase Hosting) for friend-spin join links, not the
// nomnom:// custom scheme - a custom scheme just shows as plain unclickable
// text in SMS/WhatsApp/etc (only http/https get auto-linkified there), which
// is why sharing a join link/code wasn't tappable (user report). Verified as
// an Android App Link via app.config.js's android.intentFilters + the
// asset-links file at public/.well-known/assetlinks.json (deployed via
// `firebase deploy --only hosting`, kept in sync with this host by hand -
// see TODO.md). Must match that intentFilters host exactly.
export const JOIN_LINK_BASE_URL = 'https://nom-nom-83f11.web.app/join';

// The main filter screen's vertical spacing (padding/margins on App.js's
// homeScreen and FilterPanel's cards) was tuned against a "comfortable"
// screen height, then just left as fixed pixel constants - which looked
// fine on whatever device it was built/tested on, but silently ran out of
// room on shorter devices (a Galaxy S20 report: the Cuisines trigger at the
// bottom of that static, non-scrolling panel getting clipped/inaccessible -
// see App.js/FilterPanel.js history). Screen height varies device to device
// for reasons beyond raw physical size (nav bar mode, camera cutout, aspect
// ratio), so hand-tuning constants per device report doesn't scale to "many
// phones eventually" (user request) - this scales spacing continuously off
// the actual available height instead. Floor of 0.7 keeps things from
// getting comically cramped on genuinely tiny screens rather than shrinking
// without bound.
const VERTICAL_SPACING_BASELINE = 780;
const VERTICAL_SPACING_MIN_SCALE = 0.7;

// Multiply any vertical padding/margin constant by this to make it scale
// down smoothly on shorter screens instead of staying fixed. Devices at or
// above the baseline height get a scale of 1 (unchanged) - this only ever
// shrinks spacing, never grows it beyond what was originally designed.
export function useVerticalScale() {
  const { height } = useWindowDimensions();
  return Math.min(1, Math.max(VERTICAL_SPACING_MIN_SCALE, height / VERTICAL_SPACING_BASELINE));
}

// Alphabetical - the bubble picker just renders these in array order, so
// this is the only place ordering needs to be maintained (user feedback:
// the old grouping felt chaotic).
// Rebuilt directly off Google's own Places API "Food and Drink" type table
// (see places.js's CUISINE_TYPE_REQUIREMENTS comment for the full
// taxonomy) - restaurant/cuisine-specific types plus the cafes/drinks/
// sweets group, so every entry here has a real backing Google type to
// confirm a result against (user request: "use the Google specific labels
// across the board if we are using its API"). Left out on purpose: the
// "venue format" group (bar, pub, buffet, fine dining, food court, steak
// house, bar-and-grill, fast food, breakfast, brunch, wine bar) - that's a
// different axis than "what cuisine," and wasn't part of what was asked
// for; Diner is kept only because it already existed here before. Also
// left out: cat_cafe/dog_cafe (real Google types, but niche enough that
// most areas would return zero results, making them a dead filter option).
//
// Five OLD entries dropped here because Google has no matching type for
// them at all (previously keyword/name-matched only, see NAME_HINTS):
// Boba, Caribbean, Peruvian, Puerto Rican, Southern Comfort. Any dish in
// foods.js still tagged with one of those five cuisine names isn't wrong,
// just inert now - it simply can't be reached via any filter anymore,
// same as an untagged dish would behave.
export const CUISINES = [
  'Acai', 'African', 'American', 'Armenian', 'Asian', 'Bagels', 'Bakery',
  'BBQ', 'Brazilian', 'Burgers', 'Cafe', 'Candy', 'Chinese', 'Chocolate',
  'Coffee', 'Deli', 'Dessert', 'Diner', 'Donuts', 'French', 'Greek',
  'Ice Cream', 'Indian', 'Indonesian', 'Italian', 'Japanese', 'Juice',
  'Korean', 'Lebanese', 'Mediterranean', 'Mexican', 'Middle Eastern',
  'Pizza', 'Ramen', 'Sandwiches', 'Seafood', 'Spanish', 'Sushi', 'Tea',
  'Thai', 'Turkish', 'Vegan', 'Vegetarian', 'Vietnamese',
];

export const SPEEDS_MPH = { walk: 3, bike: 10, transit: 12, drive: 25 };

// Total time (ms) the coin animation takes: anticipation dip, toss/spin to
// contact, bounce, micro-bounce, precession roll, then falling flat. App.js
// waits at least this long before revealing the result, so a fast API
// response can never cut the animation short. Change the coin's timings in
// CoinSpinner.js (TOTAL_ANIMATION_MS) and update this to match.
export const COIN_ANIMATION_MS = 2400;

// Absolute review-count floor - a hard backstop below which a place is never
// shown. The real quality gate is statistical (see filterByReviewStats in
// places.js): places more than 1.5 std deviations below the local mean of
// log(review count) are dropped, which self-calibrates between dense cities
// and rural areas. This floor just catches the noise when result sets are too
// small for stats to be meaningful.
export const MIN_REVIEW_COUNT = 5;

// Only apply the statistical filter when we have at least this many
// candidates - std dev on a handful of places is noise, not signal.
export const STATS_FILTER_MIN_POOL = 12;

// How many standard deviations below the mean (of log review counts) a place
// can be before it's filtered out. Lower = stricter.
export const STATS_FILTER_SIGMA = 1.5;

export const COLORS = {
  background: '#1E1E1E',
  card: '#2A2A2A',
  cardAlt: '#3D3D3D',
  accent: '#9BAEC8',
  accentDark: '#788DAB',
  accentDeep: '#6A7F9B',
  gold: '#FFD700',
  danger: '#FF6B6B',
  textDark: '#1A222C',
  textLight: '#FFF',
  textMuted: '#AAA',
  neon: '#5EEBFF',
};

// Shared "selected" look: the light blue-grey accent fill, a bright neon
// border, and a soft dim halo glowing just beyond the shape - a real neon
// sign's tube is bright, but the ambient light it casts into the space
// around it is a much darker, softer version of the same color, not
// another bright line (this took two rounds of feedback to land on).
// Spread into a style's active variant alongside `backgroundColor: colors.accent`.
// A function (not a static object) so it follows the user's picked theme
// accent (see ThemeContext.js) instead of always being cyan.
export const neonSelected = (colors) => ({
  borderWidth: 2,
  borderColor: colors.neon,
  shadowColor: colors.neonGlow,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.9,
  shadowRadius: 10,
  elevation: 10,
});

// The coin's diagonal "catches the light" gradient (see CoinSpinner.js's
// faceHighlight/faceGradient) as a reusable, theme-following style, so any
// other solid-accent-colored selected/active button can share the same
// glossy look instead of reading flat next to it (user request, after liking
// it specifically on the coin - "add it to all of the highlighted buttons").
// Returns LinearGradient props (colors/start/end) to spread directly onto a
// <LinearGradient>, not a plain style object - a gradient can't be expressed
// as a StyleSheet backgroundColor.
export const accentGradient = (colors) => {
  const { h, s, l } = hexToHsl(colors.accent);
  return {
    colors: [hslToHex(h, s, Math.min(96, l + 24)), colors.accent, colors.accentDeep],
    start: { x: 0.15, y: 0.1 },
    end: { x: 0.85, y: 0.95 },
  };
};

// A small, neutral drop shadow for buttons that'd otherwise sit completely
// flat against the background - just enough depth to read as a physical,
// tappable surface. `elevation` alone only does anything on Android; the
// shadow* props are what iOS actually needs, so spreading this (rather
// than hand-rolling one-off `elevation: N` values, which several buttons
// had) gives every button real depth on both platforms.
export const buttonDepth = {
  elevation: 4,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 3,
};
