// Shared food-icon pool - used by the raccoon's daydream bubble
// (DaydreamRaccoon.js), the coin's spin animation (CoinSpinner.js), and the
// rolling food strip (RollingFoodStrip.js). Each entry pairs its image with
// a display name, since the rolling strip can show a food's name when
// tapped/held. Metro's require() needs static string literals, so each icon
// is required by hand; drop a new same-style icon in assets/foods/ and add
// one line below to make it show up everywhere.
//
// This is the second full icon set (170 icons, replacing the original 19 +
// the first 171-icon V1/V2 batch) - the earlier ones were archived rather
// than deleted (see assets/foods-archive-v1/ and
// assets/foods-archive-v1-manifest.js) since they're a visibly different
// illustration style and mixing styles wasn't wanted, but they're kept
// around in case there's ever a reason to blend them back in.
//
// `cuisines` (values from CUISINES in constants.js) tags which cuisine
// filter(s) a dish reasonably represents, so the coin can restrict itself to
// on-theme icons when a cuisine filter is active (user request: the coin
// used to show a completely unrelated dish - e.g. sushi while filtered to
// Mexican only - which read as a mismatch once it landed). A handful of
// dishes (Borscht, Pierogi) have no honest match in CUISINES and are left
// untagged rather than forced into a wrong bucket - foodsForCuisines()
// below falls back to the full list when a filter has no tagged matches, so
// this never leaves the coin with nothing to show.
export const FOODS = [
  { image: require('../assets/foods/alfajores.png'), name: "Alfajores", cuisines: ['Dessert', 'Peruvian'] },
  { image: require('../assets/foods/apple-pie.png'), name: "Apple Pie", cuisines: ['American', 'Dessert'] },
  { image: require('../assets/foods/arepa.png'), name: "Arepa", cuisines: ['Caribbean'] },
  { image: require('../assets/foods/arepas.png'), name: "Arepas", cuisines: ['Caribbean'] },
  { image: require('../assets/foods/baba-ganoush.png'), name: "Baba Ganoush", cuisines: ['Middle Eastern', 'Mediterranean'] },
  { image: require('../assets/foods/bagel.png'), name: "Bagel", cuisines: ['American', 'Bakery', 'Diner'] },
  { image: require('../assets/foods/bagel-with-lox.png'), name: "Bagel with Lox", cuisines: ['American', 'Bakery'] },
  { image: require('../assets/foods/baked-bean-casserole.png'), name: "Baked Bean Casserole", cuisines: ['American', 'Southern Comfort'] },
  { image: require('../assets/foods/baked-beans.png'), name: "Baked Beans", cuisines: ['American', 'Southern Comfort', 'BBQ'] },
  { image: require('../assets/foods/baked-rice-casserole.png'), name: "Baked Rice Casserole", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/baklava-square.png'), name: "Baklava Square", cuisines: ['Middle Eastern', 'Greek', 'Mediterranean', 'Dessert'] },
  { image: require('../assets/foods/bbq-beans-bowl.png'), name: "BBQ Beans Bowl", cuisines: ['BBQ', 'American', 'Southern Comfort'] },
  { image: require('../assets/foods/bbq-burger.png'), name: "BBQ Burger", cuisines: ['BBQ', 'American', 'Diner'] },
  { image: require('../assets/foods/bbq-ribs.png'), name: "BBQ Ribs", cuisines: ['BBQ', 'American', 'Southern Comfort'] },
  { image: require('../assets/foods/beef-roll-wraps.png'), name: "Beef Roll Wraps", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/beef-rolls.png'), name: "Beef Rolls", cuisines: ['American'] },
  { image: require('../assets/foods/beef-stew-pot.png'), name: "Beef Stew Pot", cuisines: ['American', 'Diner', 'Southern Comfort'] },
  { image: require('../assets/foods/beef-stew-rice.png'), name: "Beef Stew Rice", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/beef-wellington.png'), name: "Beef Wellington", cuisines: ['French'] },
  { image: require('../assets/foods/bibimbap.png'), name: "Bibimbap", cuisines: ['Korean'] },
  { image: require('../assets/foods/bibimbap-bowl.png'), name: "Bibimbap Bowl", cuisines: ['Korean'] },
  { image: require('../assets/foods/bibimbap-plate.png'), name: "Bibimbap Plate", cuisines: ['Korean'] },
  { image: require('../assets/foods/boiled-potatoes.png'), name: "Boiled Potatoes", cuisines: ['American', 'Diner', 'Southern Comfort'] },
  { image: require('../assets/foods/borscht.png'), name: "Borscht", cuisines: [] },
  { image: require('../assets/foods/braised-beef-plate.png'), name: "Braised Beef Plate", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/braised-ribs.png'), name: "Braised Ribs", cuisines: ['BBQ', 'American', 'Southern Comfort'] },
  { image: require('../assets/foods/braised-short-ribs.png'), name: "Braised Short Ribs", cuisines: ['American', 'Southern Comfort'] },
  { image: require('../assets/foods/bread-bowl-soup.png'), name: "Bread Bowl Soup", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/brioche-loaf.png'), name: "Brioche Loaf", cuisines: ['French', 'Bakery'] },
  { image: require('../assets/foods/brisket-platter.png'), name: "Brisket Platter", cuisines: ['BBQ', 'American', 'Southern Comfort'] },
  { image: require('../assets/foods/brownies.png'), name: "Brownies", cuisines: ['American', 'Dessert', 'Bakery'] },
  { image: require('../assets/foods/burrito.png'), name: "Burrito", cuisines: ['Mexican'] },
  { image: require('../assets/foods/calzone.png'), name: "Calzone", cuisines: ['Italian', 'Pizza'] },
  { image: require('../assets/foods/ceviche.png'), name: "Ceviche", cuisines: ['Peruvian', 'Seafood'] },
  { image: require('../assets/foods/ceviche-bowl.png'), name: "Ceviche Bowl", cuisines: ['Peruvian', 'Seafood'] },
  { image: require('../assets/foods/ceviche-two.png'), name: "Ceviche Two", cuisines: ['Peruvian', 'Seafood'] },
  { image: require('../assets/foods/charcuterie-board.png'), name: "Charcuterie Board", cuisines: ['French', 'American'] },
  { image: require('../assets/foods/charcuterie-board-two.png'), name: "Charcuterie Board Two", cuisines: ['French', 'American'] },
  { image: require('../assets/foods/cheesesteak-sandwich.png'), name: "Cheesesteak Sandwich", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/chicken-and-rice.png'), name: "Chicken and Rice", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/chicken-katsu-bowl.png'), name: "Chicken Katsu Bowl", cuisines: ['Japanese'] },
  { image: require('../assets/foods/chicken-leg.png'), name: "Chicken Leg", cuisines: ['American', 'Southern Comfort'] },
  { image: require('../assets/foods/chicken-wrap.png'), name: "Chicken Wrap", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/chickpea-salad.png'), name: "Chickpea Salad", cuisines: ['Mediterranean', 'Middle Eastern', 'Vegan'] },
  { image: require('../assets/foods/chili-bowl.png'), name: "Chili Bowl", cuisines: ['American', 'Southern Comfort', 'Diner'] },
  { image: require('../assets/foods/chili-dog.png'), name: "Chili Dog", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/churros.png'), name: "Churros", cuisines: ['Mexican', 'Dessert'] },
  { image: require('../assets/foods/club-sandwich.png'), name: "Club Sandwich", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/congee.png'), name: "Congee", cuisines: ['Chinese'] },
  { image: require('../assets/foods/congee-with-egg.png'), name: "Congee with Egg", cuisines: ['Chinese'] },
  { image: require('../assets/foods/cornbread.png'), name: "Cornbread", cuisines: ['American', 'Southern Comfort', 'Bakery'] },
  { image: require('../assets/foods/cornbread-loaf.png'), name: "Cornbread Loaf", cuisines: ['American', 'Southern Comfort', 'Bakery'] },
  { image: require('../assets/foods/cornbread-slice.png'), name: "Cornbread Slice", cuisines: ['American', 'Southern Comfort', 'Bakery'] },
  { image: require('../assets/foods/creme-brulee.png'), name: "Creme Brulee", cuisines: ['French', 'Dessert'] },
  { image: require('../assets/foods/croissants.png'), name: "Croissants", cuisines: ['French', 'Bakery'] },
  { image: require('../assets/foods/curry-rice-bowl.png'), name: "Curry Rice Bowl", cuisines: ['Indian'] },
  { image: require('../assets/foods/deli-meat-platter.png'), name: "Deli Meat Platter", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/deli-sandwich.png'), name: "Deli Sandwich", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/deviled-eggs.png'), name: "Deviled Eggs", cuisines: ['American', 'Southern Comfort'] },
  { image: require('../assets/foods/dim-sum-buns.png'), name: "Dim Sum Buns", cuisines: ['Chinese'] },
  { image: require('../assets/foods/dolmades.png'), name: "Dolmades", cuisines: ['Greek', 'Mediterranean', 'Middle Eastern'] },
  { image: require('../assets/foods/dosa.png'), name: "Dosa", cuisines: ['Indian'] },
  { image: require('../assets/foods/dumplings.png'), name: "Dumplings", cuisines: ['Chinese'] },
  { image: require('../assets/foods/dumplings-two.png'), name: "Dumplings Two", cuisines: ['Chinese'] },
  { image: require('../assets/foods/edamame.png'), name: "Edamame", cuisines: ['Japanese'] },
  { image: require('../assets/foods/edamame-two.png'), name: "Edamame Two", cuisines: ['Japanese'] },
  { image: require('../assets/foods/egg-rolls.png'), name: "Egg Rolls", cuisines: ['Chinese', 'Vietnamese'] },
  { image: require('../assets/foods/eggs-benedict.png'), name: "Eggs Benedict", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/empanada-rolls.png'), name: "Empanada Rolls", cuisines: ['Puerto Rican', 'Peruvian'] },
  { image: require('../assets/foods/empanadas.png'), name: "Empanadas", cuisines: ['Puerto Rican', 'Peruvian'] },
  { image: require('../assets/foods/empanadas-two.png'), name: "Empanadas Two", cuisines: ['Puerto Rican', 'Peruvian'] },
  { image: require('../assets/foods/fajitas.png'), name: "Fajitas", cuisines: ['Mexican'] },
  { image: require('../assets/foods/falafel-platter.png'), name: "Falafel Platter", cuisines: ['Middle Eastern', 'Mediterranean', 'Vegan'] },
  { image: require('../assets/foods/falafel-wrap.png'), name: "Falafel Wrap", cuisines: ['Middle Eastern', 'Mediterranean', 'Vegan'] },
  { image: require('../assets/foods/fig-and-prosciutto-pizza.png'), name: "Fig and Prosciutto Pizza", cuisines: ['Italian', 'Pizza'] },
  { image: require('../assets/foods/flan.png'), name: "Flan", cuisines: ['Mexican', 'Dessert'] },
  { image: require('../assets/foods/french-onion-soup.png'), name: "French Onion Soup", cuisines: ['French'] },
  { image: require('../assets/foods/fried-chicken-and-rice.png'), name: "Fried Chicken and Rice", cuisines: ['American', 'Southern Comfort'] },
  { image: require('../assets/foods/fried-egg-toast.png'), name: "Fried Egg Toast", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/fruit-salad.png'), name: "Fruit Salad", cuisines: ['Vegan', 'Dessert'] },
  { image: require('../assets/foods/glazed-ribs.png'), name: "Glazed Ribs", cuisines: ['BBQ', 'American', 'Southern Comfort'] },
  { image: require('../assets/foods/grilled-cheese-sandwich.png'), name: "Grilled Cheese Sandwich", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/grilled-fish.png'), name: "Grilled Fish", cuisines: ['Seafood'] },
  { image: require('../assets/foods/hamburger.png'), name: "Hamburger", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/honey-toast.png'), name: "Honey Toast", cuisines: ['Dessert', 'Coffee'] },
  { image: require('../assets/foods/hot-dog.png'), name: "Hot Dog", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/hot-dog-with-kraut.png'), name: "Hot Dog with Kraut", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/hummus-plate.png'), name: "Hummus Plate", cuisines: ['Middle Eastern', 'Mediterranean', 'Vegan'] },
  { image: require('../assets/foods/jollof-rice.png'), name: "Jollof Rice", cuisines: ['African'] },
  { image: require('../assets/foods/korean-rice-hot-pot.png'), name: "Korean Rice Hot Pot", cuisines: ['Korean'] },
  { image: require('../assets/foods/kung-pao-chicken.png'), name: "Kung Pao Chicken", cuisines: ['Chinese'] },
  { image: require('../assets/foods/lasagna.png'), name: "Lasagna", cuisines: ['Italian'] },
  { image: require('../assets/foods/lasagna-square.png'), name: "Lasagna Square", cuisines: ['Italian'] },
  { image: require('../assets/foods/lo-mein-takeout.png'), name: "Lo Mein Takeout", cuisines: ['Chinese'] },
  { image: require('../assets/foods/loaded-hot-dog.png'), name: "Loaded Hot Dog", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/loaded-nachos.png'), name: "Loaded Nachos", cuisines: ['Mexican', 'American'] },
  { image: require('../assets/foods/lobster-roll.png'), name: "Lobster Roll", cuisines: ['Seafood', 'American'] },
  { image: require('../assets/foods/meat-skewers.png'), name: "Meat Skewers", cuisines: ['Mediterranean', 'Middle Eastern', 'BBQ'] },
  { image: require('../assets/foods/meat-skewers-plate.png'), name: "Meat Skewers Plate", cuisines: ['Mediterranean', 'Middle Eastern', 'BBQ'] },
  { image: require('../assets/foods/meatball-stew.png'), name: "Meatball Stew", cuisines: ['Italian', 'American'] },
  { image: require('../assets/foods/meatball-stew-two.png'), name: "Meatball Stew Two", cuisines: ['Italian', 'American'] },
  { image: require('../assets/foods/meatballs.png'), name: "Meatballs", cuisines: ['Italian', 'American'] },
  { image: require('../assets/foods/miso-soup.png'), name: "Miso Soup", cuisines: ['Japanese'] },
  { image: require('../assets/foods/miso-soup-two.png'), name: "Miso Soup Two", cuisines: ['Japanese'] },
  { image: require('../assets/foods/mixed-grill-plate.png'), name: "Mixed Grill Plate", cuisines: ['Mediterranean', 'Middle Eastern', 'BBQ'] },
  { image: require('../assets/foods/mole-chicken.png'), name: "Mole Chicken", cuisines: ['Mexican'] },
  { image: require('../assets/foods/moroccan-tagine.png'), name: "Moroccan Tagine", cuisines: ['African', 'Middle Eastern'] },
  { image: require('../assets/foods/naan-bread.png'), name: "Naan Bread", cuisines: ['Indian'] },
  { image: require('../assets/foods/naan-bread-two.png'), name: "Naan Bread Two", cuisines: ['Indian'] },
  { image: require('../assets/foods/nachos.png'), name: "Nachos", cuisines: ['Mexican', 'American'] },
  { image: require('../assets/foods/nasi-lemak-plate.png'), name: "Nasi Lemak Plate", cuisines: ['Thai'] },
  { image: require('../assets/foods/noodle-soup.png'), name: "Noodle Soup", cuisines: ['Vietnamese', 'Chinese'] },
  { image: require('../assets/foods/okonomiyaki.png'), name: "Okonomiyaki", cuisines: ['Japanese'] },
  { image: require('../assets/foods/okonomiyaki-two.png'), name: "Okonomiyaki Two", cuisines: ['Japanese'] },
  { image: require('../assets/foods/orange-chicken.png'), name: "Orange Chicken", cuisines: ['Chinese'] },
  { image: require('../assets/foods/oysters.png'), name: "Oysters", cuisines: ['Seafood'] },
  { image: require('../assets/foods/paella.png'), name: "Paella", cuisines: ['Mediterranean', 'Seafood'] },
  { image: require('../assets/foods/philly-cheesesteak.png'), name: "Philly Cheesesteak", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/pierogi.png'), name: "Pierogi", cuisines: [] },
  { image: require('../assets/foods/pierogi-two.png'), name: "Pierogi Two", cuisines: [] },
  { image: require('../assets/foods/pita-plate.png'), name: "Pita Plate", cuisines: ['Middle Eastern', 'Mediterranean', 'Greek'] },
  { image: require('../assets/foods/pita-platter.png'), name: "Pita Platter", cuisines: ['Middle Eastern', 'Mediterranean', 'Greek'] },
  { image: require('../assets/foods/pizza.png'), name: "Pizza", cuisines: ['Pizza', 'Italian'] },
  { image: require('../assets/foods/pizza-two.png'), name: "Pizza Two", cuisines: ['Pizza', 'Italian'] },
  { image: require('../assets/foods/poke-bowl.png'), name: "Poke Bowl", cuisines: ['Japanese', 'Seafood'] },
  { image: require('../assets/foods/pretzel.png'), name: "Pretzel", cuisines: ['American', 'Bakery', 'Diner'] },
  { image: require('../assets/foods/pulled-pork-and-mash.png'), name: "Pulled Pork and Mash", cuisines: ['BBQ', 'American', 'Southern Comfort'] },
  { image: require('../assets/foods/quiche.png'), name: "Quiche", cuisines: ['French', 'Diner'] },
  { image: require('../assets/foods/raspberry-bar.png'), name: "Raspberry Bar", cuisines: ['Dessert', 'Bakery'] },
  { image: require('../assets/foods/ravioli.png'), name: "Ravioli", cuisines: ['Italian'] },
  { image: require('../assets/foods/ribs-platter.png'), name: "Ribs Platter", cuisines: ['BBQ', 'American', 'Southern Comfort'] },
  { image: require('../assets/foods/ribs-rack.png'), name: "Ribs Rack", cuisines: ['BBQ', 'American', 'Southern Comfort'] },
  { image: require('../assets/foods/rice-and-fish-plate.png'), name: "Rice and Fish Plate", cuisines: ['Seafood', 'Caribbean'] },
  { image: require('../assets/foods/rice-porridge.png'), name: "Rice Porridge", cuisines: ['Chinese', 'Diner'] },
  { image: require('../assets/foods/rice-with-chicken.png'), name: "Rice with Chicken", cuisines: ['Caribbean', 'American', 'Diner'] },
  { image: require('../assets/foods/roast-chicken.png'), name: "Roast Chicken", cuisines: ['American', 'French', 'Diner'] },
  { image: require('../assets/foods/roast-duck-plate.png'), name: "Roast Duck Plate", cuisines: ['Chinese'] },
  { image: require('../assets/foods/roast-turkey.png'), name: "Roast Turkey", cuisines: ['American', 'Southern Comfort'] },
  { image: require('../assets/foods/roti-rolls.png'), name: "Roti Rolls", cuisines: ['Caribbean', 'Indian'] },
  { image: require('../assets/foods/salmon-sushi-rolls.png'), name: "Salmon Sushi Rolls", cuisines: ['Japanese', 'Seafood'] },
  { image: require('../assets/foods/samosas.png'), name: "Samosas", cuisines: ['Indian'] },
  { image: require('../assets/foods/sausage-fried-rice.png'), name: "Sausage Fried Rice", cuisines: ['Chinese', 'American'] },
  { image: require('../assets/foods/scones.png'), name: "Scones", cuisines: ['Bakery', 'Coffee', 'French'] },
  { image: require('../assets/foods/seafood-platter.png'), name: "Seafood Platter", cuisines: ['Seafood'] },
  { image: require('../assets/foods/shakshuka.png'), name: "Shakshuka", cuisines: ['Middle Eastern', 'Mediterranean', 'African'] },
  { image: require('../assets/foods/shawarma-wrap.png'), name: "Shawarma Wrap", cuisines: ['Middle Eastern', 'Mediterranean'] },
  { image: require('../assets/foods/shrimp-ceviche.png'), name: "Shrimp Ceviche", cuisines: ['Peruvian', 'Seafood'] },
  { image: require('../assets/foods/shrimp-cocktail.png'), name: "Shrimp Cocktail", cuisines: ['Seafood', 'American'] },
  { image: require('../assets/foods/soup-dumplings.png'), name: "Soup Dumplings", cuisines: ['Chinese'] },
  { image: require('../assets/foods/sourdough-bread.png'), name: "Sourdough Bread", cuisines: ['Bakery', 'American'] },
  { image: require('../assets/foods/spicy-nachos.png'), name: "Spicy Nachos", cuisines: ['Mexican', 'American'] },
  { image: require('../assets/foods/spring-roll-basket.png'), name: "Spring Roll Basket", cuisines: ['Vietnamese', 'Chinese', 'Thai'] },
  { image: require('../assets/foods/spring-rolls.png'), name: "Spring Rolls", cuisines: ['Vietnamese', 'Chinese', 'Thai'] },
  { image: require('../assets/foods/sub-sandwich.png'), name: "Sub Sandwich", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/sub-sandwich-two.png'), name: "Sub Sandwich Two", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/sushi-rolls.png'), name: "Sushi Rolls", cuisines: ['Japanese', 'Seafood'] },
  { image: require('../assets/foods/sushi-rolls-two.png'), name: "Sushi Rolls Two", cuisines: ['Japanese', 'Seafood'] },
  { image: require('../assets/foods/sweet-and-sour-chicken.png'), name: "Sweet and Sour Chicken", cuisines: ['Chinese'] },
  { image: require('../assets/foods/tacos.png'), name: "Tacos", cuisines: ['Mexican'] },
  { image: require('../assets/foods/takoyaki-skewers.png'), name: "Takoyaki Skewers", cuisines: ['Japanese', 'Seafood'] },
  { image: require('../assets/foods/tea-sandwiches.png'), name: "Tea Sandwiches", cuisines: ['American', 'Coffee', 'Diner'] },
  { image: require('../assets/foods/teriyaki-bowl.png'), name: "Teriyaki Bowl", cuisines: ['Japanese'] },
  { image: require('../assets/foods/tom-yum-soup.png'), name: "Tom Yum Soup", cuisines: ['Thai', 'Seafood'] },
  { image: require('../assets/foods/tortellini-soup.png'), name: "Tortellini Soup", cuisines: ['Italian'] },
  { image: require('../assets/foods/truffle-mac-and-cheese.png'), name: "Truffle Mac and Cheese", cuisines: ['American', 'Diner'] },
  { image: require('../assets/foods/tteokbokki.png'), name: "Tteokbokki", cuisines: ['Korean'] },
  { image: require('../assets/foods/tteokbokki-two.png'), name: "Tteokbokki Two", cuisines: ['Korean'] },
  { image: require('../assets/foods/waffles-with-berries.png'), name: "Waffles with Berries", cuisines: ['American', 'Dessert', 'Coffee', 'Diner'] },
  { image: require('../assets/foods/whole-grilled-fish.png'), name: "Whole Grilled Fish", cuisines: ['Seafood', 'Mediterranean'] },
  { image: require('../assets/foods/wonton-soup.png'), name: "Wonton Soup", cuisines: ['Chinese'] },
];

// Narrows FOODS down to dishes tagged with at least one of the given
// cuisines. Falls back to the full list when `cuisines` is empty or when
// none of the tagged dishes match (some CUISINES entries - Boba, Vegan as a
// whole-menu filter rather than a dish tag, etc. - don't have a clean
// dish-level match in this icon set) so callers always get a non-empty pool.
export function foodsForCuisines(cuisines) {
  if (!cuisines || cuisines.length === 0) return FOODS;
  const matched = FOODS.filter((f) => f.cuisines && f.cuisines.some((c) => cuisines.includes(c)));
  return matched.length > 0 ? matched : FOODS;
}

/**
 * Returns a picker function that hands out entries from `pool` (defaults to
 * the full FOODS list) in a shuffled "bag" - every item appears once before
 * any repeat, then the bag reshuffles for the next cycle. Call this once per
 * consumer (raccoon, coin, rolling strip) so each keeps its own independent
 * sequence rather than sharing one global cursor - otherwise using the coin
 * while the raccoon is also cycling would visibly skip entries out from
 * under it. CoinSpinner rebuilds its picker per spin against a
 * foodsForCuisines()-filtered pool, so a spin made with a cuisine filter
 * active only ever shows (and lands on) matching dishes.
 */
export function createFoodPicker(pool = FOODS) {
  let bag = [];
  return function pick() {
    if (bag.length === 0) {
      bag = [...pool];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
}
