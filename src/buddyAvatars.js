// The "pick your buddy" profile-avatar set (Settings tab identity, replacing
// a plain gear icon) - 9 illustrated animals, user-provided art, cropped
// tight to each one's own card border. require() paths must be static
// string literals for Metro to bundle them, so this is a plain object
// literal rather than something built from a loop over BUDDY_KEYS.
export const BUDDY_AVATARS = {
  raccoon: { label: 'Raccoon', source: require('../assets/buddies/raccoon.png') },
  fox: { label: 'Fox', source: require('../assets/buddies/fox.png') },
  panda: { label: 'Panda', source: require('../assets/buddies/panda.png') },
  sloth: { label: 'Sloth', source: require('../assets/buddies/sloth.png') },
  bear: { label: 'Bear', source: require('../assets/buddies/bear.png') },
  bunny: { label: 'Bunny', source: require('../assets/buddies/bunny.png') },
  cat: { label: 'Cat', source: require('../assets/buddies/cat.png') },
  owl: { label: 'Owl', source: require('../assets/buddies/owl.png') },
  koala: { label: 'Koala', source: require('../assets/buddies/koala.png') },
};

// Order they appear in the picker grid (3x3) - object key order isn't a
// safe thing to rely on for render order, so this is explicit.
export const BUDDY_KEYS = ['raccoon', 'fox', 'panda', 'sloth', 'bear', 'bunny', 'cat', 'owl', 'koala'];
