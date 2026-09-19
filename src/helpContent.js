// Source of truth for the in-app help screen (src/components/HelpModal.js),
// opened from Settings' "(i)" button (full guide) and from the Cuisines
// header's "(i)" button (just the `filters` section, scoped). Ported from
// the original "Nomnom Field Guide" browser mock-up built for this feature -
// kept in sync by hand, not generated from the app.

// The handful of things a first-time user actually needs before the coin
// spins - not another accordion, just a short always-visible list. The
// exhaustive gesture-by-gesture reference lives in HELP_SECTIONS below.
export const HELP_QUICK_START = [
  { icon: 'aperture-outline', text: 'Tap the coin to spin - a fast flick works too.' },
  { icon: 'hand-left-outline', text: 'Hold any food icon for its full write-up, allergens, and a "find it near me" search.' },
  { icon: 'apps-outline', text: 'The bottom nav gets you anywhere: Places for History/Try Later/Journal, Favorites has its own icon.' },
  { icon: 'close-circle-outline', text: 'In Eliminate mode, ✕ knocks out a pick - nothing is final until the bracket is down to one.' },
  { icon: 'settings-outline', text: 'The gear icon holds filters, accent color, and app settings.' },
];

// Moves flagged `secret: true` below get a small sparkle badge in the full
// guide - these are the gestures with no on-screen hint anywhere in the app.
// (Previously duplicated in a separate top-level list; folded into their
// section instead so nothing is said twice.)

// Every section, in the order they appear in the full guide. `groups` lets a
// section split its moves under sub-labels (e.g. "filters" has Sliders vs.
// Fave slots) - a section with just one group leaves `label` unset.
export const HELP_SECTIONS = [
  {
    id: 'home',
    icon: 'home-outline',
    title: 'Home, the Coin & Getting Around',
    description: 'Everything starts here - pick a mode, set your filters, spin. Everywhere else is one tap away on the bottom nav.',
    groups: [
      {
        moves: [
          { tag: 'tap', action: 'The coin', result: 'Spins for a pick. Disabled with a "Locating..." label until your GPS fix comes in.' },
          { tag: 'swipe', action: 'The coin', result: 'Also spins it - a fast swipe (flick) works exactly like a tap.', secret: true },
          { tag: 'visible', action: 'Surprise Me / Eliminate / Curated', result: 'Switches what a spin gives you: one pick, a 5-way bracket, or a 12-spot list.' },
        ],
      },
      {
        label: 'Quick filters (bottom-right, always visible)',
        moves: [
          { tag: 'tap', icon: 'cash-outline', action: 'Price', result: 'Cycles through price caps $ - $$$$, then off.' },
          { tag: 'tap', icon: 'time-outline', action: 'Open Now', result: 'Toggles "Open now" - only shows spots that are currently open.' },
          { tag: 'tap', icon: 'heart-circle-outline', action: 'Favorites-only', result: 'Rolls only from Favorites - flags in a couple outside your distance if needed.' },
        ],
      },
      {
        label: 'Bottom nav (every screen, floating pill)',
        moves: [
          { tag: 'visible', icon: 'home', action: 'Home', result: 'The coin and its filters - this section.' },
          { tag: 'visible', action: 'Places', result: 'History, Try Later, and your Journal (yours and friends\') - see below.' },
          { tag: 'visible', icon: 'people', action: 'Feast', result: 'Starts the real-time Feast with Friends flow - see that section below.' },
          { tag: 'visible', icon: 'heart', action: 'Favorites', result: 'Your saved spots, on their own. Its own + button lets you add a spot by search, too.' },
          { tag: 'visible', icon: 'settings-sharp', action: 'Settings', result: 'Filters, accent color, and app settings.' },
        ],
      },
    ],
  },
  {
    id: 'strip',
    icon: 'fast-food-outline',
    title: 'The Rolling Food Strip',
    description: "Looks decorative. Isn't - every icon and even the empty space between them does something.",
    groups: [{
      moves: [
        { tag: 'tap', action: 'A rolling icon', result: 'Freezes it in place and pops out its name. Tap again to resume rolling.' },
        { tag: 'hold', action: 'Any icon, rolling or paused', result: 'A detail card - write-up, allergens, cultural background, and a "find it near me" search.', secret: true },
        { tag: 'swipe', action: 'A paused icon, left or right', result: "Flings it off that side immediately. Only works once it's already paused.", secret: true },
        { tag: 'drag', action: 'The empty background of the strip', result: 'Scrubs forward or back through the icon sequence - drag right to fast-forward, left to rewind.', secret: true },
      ],
    }],
  },
  {
    id: 'filters',
    icon: 'options-outline',
    title: 'Filters & Fave Cuisines',
    description: 'Distance, rating, travel mode, and your saved cuisine presets.',
    groups: [
      {
        label: 'Sliders',
        moves: [
          { tag: 'tap', action: 'Anywhere on the distance or rating track', result: "Jumps straight to that value - you don't have to grab the dial.", secret: true },
          { tag: 'drag', action: 'The dial, or the travel-mode row', result: 'Slides between values / icons in real time.' },
          { tag: 'tap', action: 'The "~10 mins" readout', result: 'Type an exact number of minutes directly instead of dragging to it.' },
        ],
      },
      {
        label: 'Fave cuisine slots (inside Cuisines)',
        moves: [
          { tag: 'tap', action: 'The Fave 1/2/3 button', result: "Loads that slot's saved cuisines into your active filter." },
          { tag: 'swipe', action: 'The Fave button, up/down', result: 'Cycles between your 3 saved slots.', secret: true },
          { tag: 'hold', action: 'The Fave button', result: "Saves your current selection into that slot - or opens a rename field if nothing's changed.", secret: true },
        ],
      },
    ],
  },
  {
    id: 'results',
    icon: 'dice-outline',
    title: 'Getting a Result',
    description: 'What you land on depends on the mode you picked.',
    groups: [
      {
        label: 'Surprise Me - the result card',
        moves: [
          { tag: 'visible', action: 'Heart / bookmark / info / paper-plane', result: 'Favorite, save for later, full details, or send this pick to a friend.' },
          { tag: 'tap', action: 'The distance/time badge', result: 'Turn-by-turn directions.' },
          { tag: 'visible', action: 'Flip Again', result: 'Rerolls - usually instant, since your last search stays cached.' },
        ],
      },
      {
        label: 'Eliminate - the 5-way bracket',
        moves: [
          { tag: 'tap', action: '✕ on a row', result: 'Eliminates it. It stays visible, greyed out - nothing disappears.' },
          { tag: 'tap', action: 'A name, or its map pin', result: 'Full details for that spot.' },
          { tag: 'visible', action: 'Undo / Pick for me', result: 'Restores your last elimination, or lets the app finish the bracket for you.' },
        ],
      },
      {
        label: 'Curated - the browsable list',
        moves: [
          { tag: 'tap', action: 'A row', result: 'Full details. Tap just the photo to open it fullscreen instead.' },
          { tag: 'visible', action: 'Refresh', result: 'Serves more from the same search - no repeats until the pool runs dry.' },
        ],
      },
    ],
  },
  {
    id: 'photos',
    icon: 'image-outline',
    title: 'Any Photo, Fullscreen',
    description: "Same viewer everywhere a photo shows up - none of this is written down anywhere in the app itself.",
    groups: [{
      moves: [
        { tag: 'pinch', action: 'Two fingers, any zoom level', result: 'Zooms 1-4x. Let go under ~1.05x and it snaps cleanly back to fit.', secret: true },
        { tag: 'drag', action: 'One finger, while zoomed in', result: "Pans around - clamped so you can't drag past the photo's edge." },
        { tag: 'swipe', action: 'Fast swipe at the edge, while zoomed in', result: 'Jumps to the next/previous photo. Needs both - fast, and already pinned to the edge.' },
        { tag: 'swipe', action: 'Not zoomed in', result: "Moves to the next/previous photo, if there's more than one." },
        { tag: 'tap', action: 'The photo, or the backdrop', result: "Closes. Only works when not zoomed in - zoom out first if a tap isn't closing it." },
      ],
    }],
  },
  {
    id: 'spot',
    icon: 'location-outline',
    title: "A Spot's Full Details",
    description: 'Directions, hours, delivery links, and your own review - all in one sheet.',
    groups: [{
      moves: [
        { tag: 'visible', action: 'Directions / Website / Phone / DoorDash / Uber Eats', result: 'Each opens the matching app or site. Delivery links search by name - no guaranteed exact match.' },
        { tag: 'visible', action: 'Heart / bookmark / share', result: 'Favorite, try later, or share a Google Maps link to this exact place.' },
        { tag: 'tap', action: 'The pencil in "Journal"', result: 'Rate 1-5, add a note, optionally attach a photo from your library.' },
        { tag: 'tap', action: "A photo's share row", result: 'Toggles Only visible to you / Visible to friends - private by default, always.', secret: true },
      ],
    }],
  },
  {
    id: 'lists',
    icon: 'book-outline',
    title: 'Places: History, Try Later & Journal',
    description: "Reached from the Places tab in the bottom nav. Favorites has its own bottom-nav icon instead - it isn't a tab in here.",
    groups: [{
      moves: [
        { tag: 'tap', action: 'A row', result: 'Full details. The compass icon jumps straight to directions.' },
        { tag: 'tap', action: 'The heart/bookmark on a row', result: 'Favorites or removes it without opening the full sheet.' },
        { tag: 'visible', action: '+ on Try Later', result: "Search and add any restaurant by name, even one you've never spun." },
        { tag: 'tap', action: 'Mine / Friends in the Journal', result: 'Switch between your own reviews and what your friends have written, grouped by city.' },
      ],
    }],
  },
  {
    id: 'friends',
    icon: 'people-outline',
    title: 'Feast with Friends',
    description: "A live, turn-based session between two phones - from picking a spot to locking in a time. Started from the Feast tab in the bottom nav.",
    groups: [{
      moves: [
        { tag: 'visible', action: 'Start a session', result: 'Generates a 4-letter code to share - whoever opens the link joins automatically.' },
        { tag: 'visible', action: "Ping, next to a friend's name", result: 'Starts a session and notifies them - the invite shows up as a banner from anywhere in the app.', secret: true },
        { tag: 'tap', action: '✕ during play', result: 'Eliminates a spot, only enabled on your turn.' },
        { tag: 'tap', action: "I'm in, in the schedule sheet", result: "Locks your side of a proposed time. Once you're both locked, Add to Calendar appears." },
        { tag: 'visible', action: 'The calendar icon on your result', result: "Glows once you're both locked in. A small red dot means an unread message.", secret: true },
      ],
    }],
  },
  {
    id: 'settings',
    icon: 'settings-outline',
    title: 'Settings',
    description: 'Reached from the Settings tab in the bottom nav.',
    groups: [{
      moves: [
        { tag: 'tap', action: 'Anywhere on the color bar', result: 'Jumps your accent color there directly.' },
        { tag: 'tap', action: 'The "Color / Brightness" chip', result: 'Switches what the bar controls - otherwise you can only ever change hue.', secret: true },
        { tag: 'visible', action: 'Report a Bug', result: 'A quick text box - send it straight to the team.' },
      ],
    }],
  },
];

export const findHelpSection = (id) => HELP_SECTIONS.find((s) => s.id === id) || null;
