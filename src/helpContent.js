// Source of truth for the in-app help screen (src/components/HelpModal.js),
// opened from Settings' "(i)" button (full guide) and from the Cuisines
// header's "(i)" button (just the `filters` section, scoped). Ported from
// the original "Nomnom Field Guide" browser mock-up built for this feature -
// kept in sync by hand, not generated from the app.

// The 11 gestures with no on-screen hint anywhere else in the app.
export const HELP_HIGHLIGHTS = [
  {
    title: 'Long-press any rolling food icon',
    text: 'Description, allergens, cultural background, and a live "find it near me" search.',
  },
  {
    title: 'Swipe a paused food icon',
    text: 'Flings it off screen instead of waiting for it to roll away.',
  },
  {
    title: 'Drag the empty space in the food strip',
    text: 'Scrubs back and forth through icons, like scrubbing a video.',
  },
  {
    title: "Flick the coin, don't just tap it",
    text: 'A fast swipe spins it exactly like a tap does.',
  },
  {
    title: 'Swipe the Fave slot up/down',
    text: 'Cycles between your 3 saved cuisine presets.',
  },
  {
    title: 'Long-press the Fave slot',
    text: 'Saves your current cuisines into it, or renames it if nothing changed.',
  },
  {
    title: 'Tap anywhere on a slider track',
    text: "Distance, rating, even the Settings color bar - jumps straight there, no need to grab the dial.",
  },
  {
    title: 'Pinch any photo',
    text: 'Zoom 1-4x, pan while zoomed, fast-swipe-at-the-edge to jump to the next photo.',
  },
  {
    title: '"Color / Brightness" in Settings',
    text: 'Tap it to unlock adjusting brightness, not just hue.',
  },
  {
    title: 'Journal photos are private until you say otherwise',
    text: 'A per-photo toggle controls whether friends can ever see it.',
  },
  {
    title: "A friend's ping can arrive from anywhere",
    text: "A glowing calendar icon quietly means you're both locked in.",
  },
];

// Every section, in the order they appear in the full guide. `groups` lets a
// section split its moves under sub-labels (e.g. "filters" has Sliders vs.
// Fave slots) - a section with just one group leaves `label` unset.
export const HELP_SECTIONS = [
  {
    id: 'home',
    icon: 'home-outline',
    title: 'Home & the Coin',
    description: 'Everything starts here - pick a mode, set your filters, spin.',
    groups: [{
      moves: [
        { tag: 'tap', action: 'The coin', result: 'Spins for a pick. Disabled with a "Locating..." label until your GPS fix comes in.' },
        { tag: 'swipe', action: 'The coin', result: 'Also spins it - a fast swipe (flick) works exactly like a tap.' },
        { tag: 'visible', action: 'Surprise Me / Eliminate / Curated', result: 'Switches what a spin gives you: one pick, a 5-way bracket, or a 12-spot list.' },
        { tag: 'tap', action: 'Feast with Friends', result: 'The real-time multiplayer flow - see the Feast with Friends section below.' },
      ],
    }],
  },
  {
    id: 'menu',
    icon: 'menu-outline',
    title: 'The Menu',
    description: 'The ☰ button, bottom-right - shortcuts to your lists, plus two quick filters.',
    groups: [{
      moves: [
        { tag: 'tap', icon: 'menu', action: '☰', result: 'Expands into the icons below. Tap it again, or anywhere outside, to collapse.' },
        { tag: 'visible', icon: 'heart', action: 'Heart', result: 'Favorites - search to add a place you know.' },
        { tag: 'visible', icon: 'bookmark', action: 'Bookmark', result: 'Try Later - spots to check out another time.' },
        { tag: 'visible', icon: 'book', action: 'Book', result: 'History - everywhere a spin has sent you.' },
        { tag: 'visible', icon: 'create', action: 'Pencil', result: 'Journal - your ratings and notes, plus friends\' writeups.' },
        { tag: 'visible', icon: 'time-outline', action: 'Clock', result: 'Toggles "Open now" - only shows spots that are currently open.' },
        { tag: 'visible', icon: 'cash', action: 'Cash', result: 'Reveals price levels $ - $$$$. Tap one to cap results at that price, tap it again to clear.' },
        { tag: 'visible', icon: 'heart-circle', action: 'Heart-circle', result: 'Rolls only from Favorites - flags in a couple outside your distance if needed.' },
      ],
    }],
  },
  {
    id: 'strip',
    icon: 'fast-food-outline',
    title: 'The Rolling Food Strip',
    description: "Looks decorative. Isn't - every icon and even the empty space between them does something.",
    groups: [{
      moves: [
        { tag: 'tap', action: 'A rolling icon', result: 'Freezes it in place and pops out its name. Tap again to resume rolling.' },
        { tag: 'hold', action: 'Any icon, rolling or paused', result: 'A detail card - write-up, allergens, cultural background, and a "find it near me" search.' },
        { tag: 'swipe', action: 'A paused icon, left or right', result: "Flings it off that side immediately. Only works once it's already paused." },
        { tag: 'drag', action: 'The empty background of the strip', result: 'Scrubs forward or back through the icon sequence - drag right to fast-forward, left to rewind.' },
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
          { tag: 'tap', action: 'Anywhere on the distance or rating track', result: "Jumps straight to that value - you don't have to grab the dial." },
          { tag: 'drag', action: 'The dial, or the travel-mode row', result: 'Slides between values / icons in real time.' },
          { tag: 'tap', action: 'The "~10 mins" readout', result: 'Type an exact number of minutes directly instead of dragging to it.' },
        ],
      },
      {
        label: 'Fave cuisine slots (inside Cuisines)',
        moves: [
          { tag: 'tap', action: 'The Fave 1/2/3 button', result: "Loads that slot's saved cuisines into your active filter." },
          { tag: 'swipe', action: 'The Fave button, up/down', result: 'Cycles between your 3 saved slots.' },
          { tag: 'hold', action: 'The Fave button', result: "Saves your current selection into that slot - or opens a rename field if nothing's changed." },
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
        { tag: 'pinch', action: 'Two fingers, any zoom level', result: 'Zooms 1-4x. Let go under ~1.05x and it snaps cleanly back to fit.' },
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
        { tag: 'tap', action: "A photo's share row", result: 'Toggles Only visible to you / Visible to friends - private by default, always.' },
      ],
    }],
  },
  {
    id: 'lists',
    icon: 'book-outline',
    title: 'History, Favorites & Your Journal',
    description: 'Reached from the ☰ menu, bottom-right.',
    groups: [{
      moves: [
        { tag: 'tap', action: 'A row', result: 'Full details. The compass icon jumps straight to directions.' },
        { tag: 'tap', action: 'The heart/bookmark on a row', result: 'Favorites or removes it without opening the full sheet.' },
        { tag: 'visible', action: '+ on Favorites or Try Later', result: "Search and add any restaurant by name, even one you've never spun." },
        { tag: 'tap', action: 'Mine / Friends in the Journal', result: 'Switch between your own reviews and what your friends have written, grouped by city.' },
      ],
    }],
  },
  {
    id: 'friends',
    icon: 'people-outline',
    title: 'Feast with Friends',
    description: 'A live, turn-based session between two phones - from picking a spot to locking in a time.',
    groups: [{
      moves: [
        { tag: 'visible', action: 'Start a session', result: 'Generates a 4-letter code to share - whoever opens the link joins automatically.' },
        { tag: 'visible', action: "Ping, next to a friend's name", result: 'Starts a session and notifies them - the invite shows up as a banner from anywhere in the app.' },
        { tag: 'tap', action: '✕ during play', result: 'Eliminates a spot, only enabled on your turn.' },
        { tag: 'tap', action: "I'm in, in the schedule sheet", result: "Locks your side of a proposed time. Once you're both locked, Add to Calendar appears." },
        { tag: 'visible', action: 'The calendar icon on your result', result: "Glows once you're both locked in. A small red dot means an unread message." },
      ],
    }],
  },
  {
    id: 'settings',
    icon: 'settings-outline',
    title: 'Settings',
    description: 'The gear icon, bottom-left.',
    groups: [{
      moves: [
        { tag: 'tap', action: 'Anywhere on the color bar', result: 'Jumps your accent color there directly.' },
        { tag: 'tap', action: 'The "Color / Brightness" chip', result: 'Switches what the bar controls - otherwise you can only ever change hue.' },
        { tag: 'visible', action: 'Report a Bug', result: 'A quick text box - send it straight to the team.' },
      ],
    }],
  },
];

export const findHelpSection = (id) => HELP_SECTIONS.find((s) => s.id === id) || null;
