/**
 * DEV-ONLY fake journal data - 100 made-up places spread across a dozen
 * US cities, each with 1-3 "At the Table" style entries, so the Journal's
 * grouping/search/collapse UI can be exercised at realistic volume without
 * eating 100 real meals first (user request: "make 100 different fake
 * places with different locations so I can test it out").
 *
 * Every entry carries `fake: true` and a `fake-NN` spot id so they can be
 * (a) stripped back out with one tap (stripFakeEntries, wired to a
 * __DEV__-only Settings button) and (b) excluded from the Firestore mirror
 * in App.js - this device's account is every new install's default friend,
 * so fake reviews leaking into pushJournal would show up in real users'
 * Friends tabs.
 *
 * Photos are plain 2-D text placeholders from placehold.co (user request:
 * "super basic 2d text images so we don't waste too much on development") -
 * zero cost, no API key, just needs a network connection to render.
 *
 * Deterministic (seeded PRNG) so the same 100 places come back every time;
 * only the timestamps are anchored to "now" so the Recent grouping stays
 * meaningful whenever this is run.
 */

// mulberry32 - tiny seeded PRNG, good enough for test data.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [city, state, lat, lng, how many of the 100 land here]
const CITIES = [
  ['Seattle', 'WA', 47.6062, -122.3321, 25],
  ['Portland', 'OR', 45.5152, -122.6784, 12],
  ['San Francisco', 'CA', 37.7749, -122.4194, 12],
  ['Los Angeles', 'CA', 34.0522, -118.2437, 10],
  ['Austin', 'TX', 30.2672, -97.7431, 8],
  ['Chicago', 'IL', 41.8781, -87.6298, 8],
  ['New York', 'NY', 40.7128, -74.0060, 8],
  ['Denver', 'CO', 39.7392, -104.9903, 6],
  ['Nashville', 'TN', 36.1627, -86.7816, 5],
  ['Honolulu', 'HI', 21.3069, -157.8583, 3],
  ['Boise', 'ID', 43.6150, -116.2023, 3],
];

const STREETS = ['Pine St', 'Oak Ave', 'Market St', 'Broadway', 'Union St', '5th Ave', 'Main St', 'Lake Dr', 'Cedar Blvd', 'Harbor Way', 'Maple Rd', 'Elm St'];

// Per cuisine: name word pools and dishes to "order".
const CUISINES = [
  { type: 'Mexican', first: ['Casa', 'Taqueria', 'El', 'La', 'Cantina'], last: ['Rosa', 'Jalisco', 'Sol', 'Luna', 'Agave', 'Oaxaca'],
    dishes: ['tacos al pastor', 'carnitas burrito', 'mole enchiladas', 'street corn', 'birria tacos', 'chile relleno'], bg: 'E76F51' },
  { type: 'Thai', first: ['Thai', 'Bangkok', 'Siam', 'Lotus', 'Basil'], last: ['Kitchen', 'Garden', 'House', 'Orchid', 'Spoon'],
    dishes: ['pad see ew', 'green curry', 'khao soi', 'tom yum', 'mango sticky rice', 'larb'], bg: '2A9D8F' },
  { type: 'Italian', first: ['Trattoria', 'Osteria', 'Nonna', 'Pasta', 'Il'], last: ['Rossi', 'Bella', 'Toscana', 'Forno', 'Vino'],
    dishes: ['cacio e pepe', 'lasagna', 'margherita pizza', 'osso buco', 'tiramisu', 'burrata'], bg: 'E9C46A' },
  { type: 'Japanese', first: ['Sushi', 'Ramen', 'Izakaya', 'Sakura', 'Umi'], last: ['Ten', 'Yama', 'Kai', 'Hana', 'Ichiban'],
    dishes: ['tonkotsu ramen', 'omakase', 'chirashi bowl', 'karaage', 'okonomiyaki', 'spicy tuna roll'], bg: 'F4A261' },
  { type: 'Chinese', first: ['Golden', 'Jade', 'Dragon', 'Lucky', 'Sichuan'], last: ['Wok', 'Palace', 'Garden', 'Noodle', 'House'],
    dishes: ['dan dan noodles', 'xiao long bao', 'mapo tofu', 'peking duck', 'salt and pepper squid', 'char siu'], bg: 'D62828' },
  { type: 'Indian', first: ['Taj', 'Bombay', 'Saffron', 'Masala', 'Curry'], last: ['Palace', 'Kitchen', 'Leaf', 'Spice', 'Express'],
    dishes: ['butter chicken', 'lamb vindaloo', 'garlic naan', 'chana masala', 'biryani', 'dosa'], bg: 'F77F00' },
  { type: 'Korean', first: ['Seoul', 'Kimchi', 'Han', 'Gogi', 'Bibim'], last: ['House', 'BBQ', 'Pocha', 'Table', 'Kitchen'],
    dishes: ['galbi', 'bibimbap', 'kimchi jjigae', 'tteokbokki', 'fried chicken', 'japchae'], bg: '9B2226' },
  { type: 'Vietnamese', first: ['Pho', 'Saigon', 'Banh Mi', 'Lotus', 'Mekong'], last: ['Saigon', 'Bistro', 'Cafe', 'House', 'Express'],
    dishes: ['pho tai', 'banh mi', 'bun bo hue', 'spring rolls', 'com tam', 'ca phe sua da'], bg: '606C38' },
  { type: 'Burgers', first: ['Big', 'Smash', 'Burger', 'Patty', 'Grill'], last: ['Shack', 'Joint', 'Barn', 'Stand', 'Co.'],
    dishes: ['double smash burger', 'bacon cheeseburger', 'truffle fries', 'chocolate shake', 'onion rings', 'patty melt'], bg: '8338EC' },
  { type: 'Pizza', first: ['Brick', 'Slice', 'Fire', 'Tony\'s', 'Neapolitan'], last: ['Oven', 'Pizza', 'Pie', 'Pizzeria', 'Crust'],
    dishes: ['pepperoni slice', 'white pie', 'detroit style', 'margherita', 'garlic knots', 'calzone'], bg: 'BC6C25' },
  { type: 'BBQ', first: ['Smokehouse', 'Pit', 'Hickory', 'Brisket', 'Texas'], last: ['BBQ', 'Smoke', 'Barbecue', 'Boys', 'Shack'],
    dishes: ['brisket plate', 'pork ribs', 'burnt ends', 'smoked turkey', 'mac and cheese', 'banana pudding'], bg: '6A4C93' },
  { type: 'Seafood', first: ['Harbor', 'Blue', 'Salty', 'Dock', 'Pearl'], last: ['Oyster', 'Crab', 'Fish', 'Catch', 'Wharf'],
    dishes: ['fish and chips', 'oysters on the half shell', 'clam chowder', 'cioppino', 'grilled salmon', 'lobster roll'], bg: '0077B6' },
  { type: 'Breakfast', first: ['Sunny', 'Morning', 'Egg', 'Biscuit', 'Maple'], last: ['Diner', 'Cafe', 'Griddle', 'Spot', 'Kitchen'],
    dishes: ['eggs benedict', 'buttermilk pancakes', 'breakfast burrito', 'shakshuka', 'biscuits and gravy', 'french toast'], bg: 'FFB703' },
  { type: 'Mediterranean', first: ['Olive', 'Zaytoun', 'Aegean', 'Cedar', 'Fig'], last: ['Grill', 'Table', 'Kitchen', 'Mezze', 'Bistro'],
    dishes: ['lamb shawarma', 'falafel plate', 'chicken kebab', 'hummus and pita', 'baklava', 'moussaka'], bg: '3A86FF' },
  { type: 'Vegan', first: ['Green', 'Sprout', 'Root', 'Plant', 'Verde'], last: ['Bowl', 'Kitchen', 'Table', 'Cafe', 'Collective'],
    dishes: ['jackfruit tacos', 'buddha bowl', 'cashew mac', 'beet burger', 'acai bowl', 'mushroom bao'], bg: '52B788' },
];

const OCCASIONS = ['Date Night', 'Anniversary', 'Celebration', 'First Time Here', 'Catching Up', 'Birthday', 'Work Lunch'];

const OPENERS = ['Ordered the', 'Went with the', 'Split the', 'Had to try the', 'Finally got the', 'Regulars swear by the'];
const VERDICTS = {
  5: ['Unreal. Best in the city, no contest.', 'Perfect. Already planning the next trip back.', 'Every single thing hit. Zero notes.'],
  4: ['Really solid, would absolutely come back.', 'Great flavors, portions were generous.', 'Loved it. Service was a little slow but worth it.'],
  3: ['Fine. Nothing wrong with it, nothing memorable.', 'Decent, a bit overpriced for what it was.', 'Good not great. Sides were the highlight.'],
  2: ['Underseasoned and lukewarm. Disappointing.', 'Long wait, meh food. Probably a one-time thing.', 'Not for me. Too sweet across the board.'],
  1: ['Nope. Sent the main back.', 'Avoid. Something was off about the whole meal.', 'Rough night. Will not be back.'],
  0: ['Still figuring out how I feel about this one.', 'Quick stop, didn\'t sit long enough to judge.', 'Grabbed takeout, ate it cold. Not a fair test.'],
};
const EXTRAS = ['Parking was a nightmare, go early.', 'Patio is the move when it\'s nice out.', 'Ask for the off-menu special.', 'Cash only, heads up.', 'Loud inside, great for groups though.', 'Dessert menu is tiny but the one option is great.'];

const rand = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const encodeText = (s) => encodeURIComponent(s).replace(/%20/g, '+');

function placeholderPhoto(text, bg, w = 600, h = 400) {
  return `https://placehold.co/${w}x${h}/${bg}/FFFFFF/png?text=${encodeText(text)}`;
}

function pickRating(rng) {
  const r = rng();
  if (r < 0.25) return undefined; // not rated
  if (r < 0.30) return 1;
  if (r < 0.40) return 2;
  if (r < 0.60) return 3;
  if (r < 0.85) return 4;
  return 5;
}

function makeEntry(rng, spot, cuisine, when, visitNo) {
  const rating = pickRating(rng);
  const dishA = rand(rng, cuisine.dishes);
  let dishB = rand(rng, cuisine.dishes);
  if (dishB === dishA) dishB = cuisine.dishes[(cuisine.dishes.indexOf(dishA) + 1) % cuisine.dishes.length];
  const firstText = `${rand(rng, OPENERS)} ${dishA} and the ${dishB}. ${rand(rng, VERDICTS[rating || 0])}`;
  const moments = [{
    id: `fm-${spot.id}-${visitNo}-0`,
    text: firstText,
    photoUri: placeholderPhoto(dishA, cuisine.bg),
  }];
  if (rng() < 0.45) {
    moments.push({ id: `fm-${spot.id}-${visitNo}-1`, text: rand(rng, EXTRAS), photoUri: null });
  }
  if (rng() < 0.2) {
    moments.push({ id: `fm-${spot.id}-${visitNo}-2`, text: '', photoUri: placeholderPhoto(dishB, cuisine.bg) });
  }
  return {
    id: `fake-entry-${spot.id}-${visitNo}`,
    fake: true,
    spot,
    rating,
    occasion: rng() < 0.3 ? rand(rng, OCCASIONS) : '',
    moments,
    shared: false,
    createdAt: when,
    updatedAt: when,
  };
}

export function buildFakeJournal() {
  const rng = makeRng(20261108);
  const now = Date.now();
  const DAY = 86400000;
  const journal = {};
  let n = 0;
  const usedNames = new Set();

  CITIES.forEach(([city, state, lat, lng, count]) => {
    for (let i = 0; i < count; i++) {
      n += 1;
      const cuisine = rand(rng, CUISINES);
      let name = `${rand(rng, cuisine.first)} ${rand(rng, cuisine.last)}`;
      // Re-roll a few times before falling back to a numbered suffix.
      for (let tries = 0; usedNames.has(name) && tries < 25; tries++) name = `${rand(rng, cuisine.first)} ${rand(rng, cuisine.last)}`;
      while (usedNames.has(name)) name = `${rand(rng, cuisine.first)} ${rand(rng, cuisine.last)} ${randInt(rng, 2, 9)}`;
      usedNames.add(name);
      const id = `fake-${String(n).padStart(3, '0')}`;
      const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
      const googleRating = (3 + rng() * 2).toFixed(1);
      const reviewCount = randInt(rng, 40, 2400);
      const priceLevel = randInt(rng, 1, 4);
      const spot = {
        id,
        name,
        rating: googleRating,
        reviewCount,
        type: cuisine.type,
        unconfirmedCuisine: null,
        confirmedCuisine: null,
        blurb: `${'$'.repeat(priceLevel)} • ${reviewCount} reviews`,
        priceLevel,
        distance: '',
        address: `${randInt(rng, 100, 9999)} ${rand(rng, STREETS)}, ${city}, ${state} ${randInt(rng, 10000, 99999)}, USA`,
        photoUrl: placeholderPhoto(initials, cuisine.bg, 200, 200),
        // Jitter ~0.1 degrees (a few miles) around the city center.
        lat: lat + (rng() - 0.5) * 0.2,
        lng: lng + (rng() - 0.5) * 0.2,
      };

      // Mostly one visit; ~20% get 2-3 so "N visits logged" shows up.
      const visits = rng() < 0.8 ? 1 : randInt(rng, 2, 3);
      const entries = [];
      // Spread over the past ~2 years, weighted toward recent so This
      // Week / This Month buckets aren't empty.
      let when = now - Math.floor(Math.pow(rng(), 2) * 730) * DAY - randInt(rng, 0, DAY - 1);
      for (let v = 0; v < visits; v++) {
        entries.push(makeEntry(rng, spot, cuisine, when, v));
        when -= randInt(rng, 20, 200) * DAY; // earlier visit
      }
      journal[id] = entries; // already newest-first
    }
  });
  return journal;
}

export const isFakeEntry = (entry) => !!entry?.fake || String(entry?.spot?.id || '').startsWith('fake-');

/** Returns `journal` with every fake entry removed (and emptied places dropped). */
export function stripFakeEntries(journal) {
  const out = {};
  Object.entries(journal || {}).forEach(([placeId, entries]) => {
    const real = (entries || []).filter((e) => !isFakeEntry(e));
    if (real.length > 0) out[placeId] = real;
  });
  return out;
}

/** Number of fake PLACES (not entries - a place can hold 2-3 visits). */
export function countFakeEntries(journal) {
  return Object.values(journal || {}).filter((entries) => (entries || []).some(isFakeEntry)).length;
}
