import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { frostedGlow } from '../constants';
import { BUDDY_AVATARS } from '../buddyAvatars';

const ITEM_COUNT = 5;
// Must match barInner's own `gap` and `padding` below - the highlight's
// slide destinations are computed analytically from one measured row width
// rather than 5 separate per-item refs, so these two have to stay in sync
// with the actual layout by hand.
const ITEM_GAP = 6;
const BAR_PADDING = 8;
// Real, unscaled dimensions this bar actually renders at - kept here (not
// hand-copied into App.js) so anything that needs to clear the bar always
// stays correct if these ever change. ITEM_HEIGHT/BAR_BOTTOM_OFFSET are
// also used directly in this file's own styles below (item.height, barRing
// .bottom) - defined once here instead of repeating the numbers in two
// places that could drift out of sync.
const ITEM_HEIGHT = 56;
const BAR_BOTTOM_OFFSET = 22;
// Ring thickness (px) of the gradient border - the outer LinearGradient is
// sized to the full bar, `barInner` insets by exactly this much via padding,
// so only this sliver of the gradient shows around the blurred panel.
export const RING_WIDTH = 1.5;
export const BAR_HEIGHT = ITEM_HEIGHT + BAR_PADDING * 2 + RING_WIDTH * 2;
// Total clearance Home's own content needs above the screen's bottom edge
// to sit flush above the bar with real breathing room, not tucked behind
// it - the bar's own bottom offset, its full height, and (user request)
// that SAME offset again as the gap between the bar's top edge and
// whatever sits above it, so the gap below the coin visually matches the
// gap below the bar itself.
export const BOTTOM_NAV_CLEARANCE = BAR_BOTTOM_OFFSET * 2 + BAR_HEIGHT;

/**
 * Persistent 5-destination bottom nav (Option C from the design canvas
 * review: a floating pill, not a slide-out drawer or a full-width tab bar -
 * picked for tying every destination to exactly 1 tap, matching the
 * clicks-to-action goal, without the drawer's extra tap or the tab bar's
 * permanent full-width footprint).
 *
 * FabMenu.js (the old hamburger) has since been fully retired - its
 * History/Favorites/TryLater/Journal shortcuts became redundant once
 * MyPlacesHub existed, and its remaining Open Now/Max Price/Favorites-only
 * filter toggles moved to QuickFilters.js as 3 always-visible buttons
 * instead of a hamburger-expand menu.
 *
 * "Places" routes to MyPlacesHub (Favorites/Try Later/Journal/Friends as
 * tabs in one screen). This bar now also persists across Places/Favorites/
 * Feast, not just Home - it used to unmount the instant you navigated away,
 * which made its sliding highlight look broken (nothing to slide toward if
 * the whole bar just vanishes mid-tap) - see App.js's showBottomNav.
 *
 * Frosted dual-tone-edge glass (design canvas review's pick over plain cool/
 * warm variants): a slim colors.neon-to-colors.accentDeep gradient ring -
 * both derived from the user's own customizable accent hue, so the ring
 * stays personalized through the existing Settings > Appearance picker with
 * no new UI, and never clashes the way pairing it with a fixed, unrelated
 * hue could (an earlier version used colors.gold here - real hue mismatch
 * for a non-gold accent, part of why it read as "too strong," user
 * feedback). Built via the standard RN "padding trick" - an outer
 * LinearGradient sized to the
 * ring thickness, an inner view inset by that much) around a real blurred
 * panel (expo-blur's BlurView, already proven elsewhere in this app -
 * CuisineDropdown.js - so no new native-module risk here) tinted with the
 * theme accent at low opacity, same convention CuisineDropdown already
 * established for "a plain blur reads as neutral/grey, this ties it back to
 * whatever accent color the user picked." The "active" signal is a single
 * shared highlight (translucent accent fill + frostedGlow's border) that
 * SLIDES between tab slots via an Animated.Value, rather than each item
 * carrying its own conditional style - user request, after the original
 * per-item approach just snapped instantly with no sense of motion between
 * destinations. Its icon lights up in colors.neon (the same hue as the
 * ring) instead of textDark, since a fully opaque icon color would lose
 * contrast against the highlight's translucent fill.
 */
export default function BottomNav({ activeTab, onSelect, buddyAvatar }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);

  // 'favorites' replaces 'history' here (user request: "Favorites SHOULD be
  // a bottom icon... it should replace history" - it's the single most-used
  // saved list, worth its own 1-tap shortcut). History moved the other
  // direction, into MyPlacesHub's tab set, replacing Favorites there
  // ("History can replace favorites in my places").
  const items = [
    { key: 'home', label: 'Home' },
    { key: 'places', label: 'Places' },
    { key: 'feast', label: 'Feast' },
    { key: 'favorites', label: 'Favorites' },
    { key: 'settings', label: 'Settings' },
  ];
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === activeTab));

  // Row width measured once via onLayout (not 5 separate per-item refs) -
  // every item is an equal flex:1 slot, so each slot's x-offset is just
  // arithmetic off this one number + ITEM_GAP/BAR_PADDING above, which stay
  // in sync with barInner's real layout by hand.
  const [barWidth, setBarWidth] = useState(0);
  const itemWidth = barWidth > 0
    ? (barWidth - BAR_PADDING * 2 - ITEM_GAP * (ITEM_COUNT - 1)) / ITEM_COUNT
    : 0;
  const slotX = (index) => BAR_PADDING + index * (itemWidth + ITEM_GAP);

  const highlightX = useRef(new Animated.Value(0)).current;
  // Tracks whether the highlight has ever been positioned yet - the FIRST
  // time barWidth becomes known (right after mount) snaps straight to the
  // active tab's slot with no animation, so it doesn't visibly slide in
  // from x=0 before the user has done anything. Every change after that
  // (including the very first real tap) animates normally.
  const hasPositionedRef = useRef(false);

  useEffect(() => {
    if (itemWidth <= 0) return;
    const target = slotX(activeIndex);
    if (!hasPositionedRef.current) {
      hasPositionedRef.current = true;
      highlightX.setValue(target);
      return;
    }
    Animated.timing(highlightX, {
      toValue: target,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, itemWidth]);

  return (
    // Was a 2-color diagonal gradient - see FrostedGlass.js's matching
    // change for the full reasoning (user report: "bright on the left and
    // dark on the right"; approved direction: dull -> bright middle -> dull,
    // dead horizontal). Kept as BottomNav's own copy rather than switching
    // this to render via FrostedGlass itself - this bar's ring sits directly
    // on `barRing` (sized/shadowed for the bar specifically), not the
    // ref-forwarding host View FrostedGlass needs for CuisineDropdown-style
    // measurement, which this component doesn't use.
    <LinearGradient
      colors={[colors.accentDeep, colors.neon, colors.accentDeep]}
      locations={[0, 0.5, 1]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.barRing}
    >
      {/* BlurView + tint need their OWN matching border radius +
          overflow:hidden, same fix CuisineDropdown.js already established -
          Android doesn't reliably clip a native BlurView to an ancestor's
          rounded corners via the ancestor's overflow:hidden alone. */}
      <View
        style={styles.barInner}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        <BlurView intensity={55} tint="dark" style={styles.barBlur} />
        <View style={[styles.barTint, { backgroundColor: colors.accent }]} pointerEvents="none" />
        {/* One shared sliding highlight instead of each Pressable carrying
            its own active/inactive style - this is what actually SLIDES
            between tabs (user request: the old per-item conditional style
            just snapped instantly, with no sense of motion between
            destinations). Rendered before the icons so it paints underneath
            them, sized to exactly one item's slot via the analytical layout
            math above. Only rendered once a real width is known, so it
            never flashes at width:0 before the first layout pass. No
            elevation, same fix as before - Android's shadow can't render
            correctly (or in color) on this fully transparent glass surface. */}
        {itemWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.highlight,
              frostedGlow(colors),
              { elevation: 0, width: itemWidth, transform: [{ translateX: highlightX }] },
            ]}
          />
        )}
        {items.map((item, index) => {
          const active = index === activeIndex;
          return (
            <Pressable
              key={item.key}
              style={styles.item}
              onPress={() => onSelect(item.key)}
              hitSlop={4}
            >
              <NavIcon iconKey={item.key} active={active} colors={colors} buddyAvatar={buddyAvatar} styles={styles} />
            </Pressable>
          );
        })}
      </View>
    </LinearGradient>
  );
}

// 10% larger than the original 22 (user request).
const ICON_SIZE = 24;

function NavIcon({ iconKey, active, colors, buddyAvatar, styles }) {
  const color = active ? colors.neon : colors.textMuted;
  const size = ICON_SIZE;
  switch (iconKey) {
    case 'home':
      return <Ionicons name={active ? 'home' : 'home-outline'} size={size} color={color} />;
    case 'feast':
      return <Ionicons name={active ? 'people' : 'people-outline'} size={size} color={color} />;
    case 'favorites':
      return <Ionicons name={active ? 'heart' : 'heart-outline'} size={size} color={color} />;
    case 'settings':
      // A picked buddy replaces the plain gear (see BuddyPicker.js) - a
      // small round avatar reads as "this is your corner of the app"
      // rather than an admin icon, same reasoning most social apps use a
      // profile picture in this exact tab slot instead of a settings icon.
      // Falls back to the gear for the brief window before a first-launch
      // pick exists (buddyAvatar null/''), which shouldn't actually be
      // reachable in practice since BuddyPicker forces a pick first.
      if (buddyAvatar && BUDDY_AVATARS[buddyAvatar]) {
        return (
          <View style={[styles.buddyRing, active && { borderColor: colors.neon }]}>
            <Image source={BUDDY_AVATARS[buddyAvatar].source} style={styles.buddyImage} resizeMode="cover" />
          </View>
        );
      }
      return <Ionicons name="settings-sharp" size={size} color={color} />;
    case 'places':
      return <PlacesIcon color={color} />;
    default:
      return null;
  }
}

// Skyline + pin, merged - the picked "My Places" icon from the design
// canvas review: two flanking buildings with a gold pin standing in for the
// center building, flush against its neighbors (one silhouette, not a house
// icon bolted to a bookmark). Windows dropped at this size - they read as
// noise once shrunk down to a real nav icon, same call made in the canvas
// review itself. viewBox stays 24x24 regardless of the rendered size below
// (ICON_SIZE) - it's the vector's own coordinate space, not a pixel size.
function PlacesIcon({ color }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={13} width={5} height={8} stroke={color} strokeWidth={1.6} />
      <Rect x={16} y={10} width={5} height={11} stroke={color} strokeWidth={1.6} />
      <Path d="M12 7a4 4 0 00-4 4c0 4.6 4 10 4 10s4-5.4 4-10a4 4 0 00-4-4z" stroke={color} strokeWidth={1.6} />
      <Circle cx={12} cy={10.5} r={1.3} stroke={color} strokeWidth={1.2} />
      <Path d="M2 21h20" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}

const BAR_RADIUS = 26;

const makeStyles = (colors, insets) => StyleSheet.create({
  // The chosen buddy's small round avatar (settings-tab icon replacement) -
  // sized close to ICON_SIZE so it carries about the same visual weight as
  // the other 4 icons rather than looking oversized. Border color swaps
  // active/inactive same as the plain icons' own color prop, kept as a
  // border here (not a glow/shadow) since Android can't render a colored
  // shadow well on a fully opaque small circle.
  buddyRing: {
    width: 26, height: 26, borderRadius: 13, overflow: 'hidden',
    borderWidth: 1.5, borderColor: colors.textMuted,
  },
  buddyImage: { width: '100%', height: '100%' },
  // Shadow/elevation live here (not barInner) - Android's elevation needs
  // an opaque backing to clip its shadow against, and a LinearGradient
  // fully fills its own bounds, so it qualifies same as any solid View.
  //
  // elevation bumped 12 -> 24 (user request: lean into the bar visually
  // "levitating" over the swipable content behind it, rather than reading
  // as a docked footer - the coin sitting partly behind the bar already
  // reads as intentional layering once the shadow actually sells it).
  // shadowOffset/shadowOpacity/shadowRadius are iOS-only - Android reads
  // ONLY the `elevation` number for its shadow's reach/softness, same
  // platform split already documented on FrostedGlass's own glow. At 12
  // the shadow was real but too subtle against this app's already-dark
  // background to visibly convey "floating" - 24 gives a noticeably wider,
  // softer cast without tipping into looking like a rendering glitch.
  barRing: {
    position: 'absolute',
    left: 16,
    right: 16,
    // Was a flat BAR_BOTTOM_OFFSET with no insets.bottom at all - every
    // screen that reserves clearance ABOVE this bar already adds
    // insets.bottom on top of BOTTOM_NAV_CLEARANCE (see App.js's
    // homeScreen), but the bar's own position never got the matching
    // adjustment, so on a device with a real 3-button nav bar (or a tall
    // gesture pill) the bar sat low enough to actually collide with it
    // (user report, via a friend on a Galaxy phone: "half the bottom bar
    // is covered by the 3 default buttons").
    bottom: insets.bottom + BAR_BOTTOM_OFFSET,
    // Now a persistent sibling over Places/Favorites/Feast too, not just
    // Home - those screens' own root Views are explicitly zIndex:90/100
    // (see MyPlacesHub/HistoryFavoritesOverlay/FriendSpin's `overlayScreen`/
    // `screen` styles), so this needs its own explicit zIndex higher than
    // any of them to reliably paint on top - JSX order alone isn't a safe
    // enough guarantee once siblings start setting zIndex themselves.
    zIndex: 200,
    borderRadius: BAR_RADIUS,
    padding: RING_WIDTH,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 24,
  },
  barInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: ITEM_GAP,
    borderRadius: BAR_RADIUS - RING_WIDTH,
    padding: BAR_PADDING,
    overflow: 'hidden',
    // Opaque fallback so the bar isn't literally invisible on whatever
    // (rare, older-Android) device falls back to BlurView's slow RenderScript
    // path badly enough that it renders as nothing - matches the dark pill
    // this replaced closely enough that a degraded blur still reads fine.
    backgroundColor: '#171717',
  },
  barBlur: { ...StyleSheet.absoluteFillObject, borderRadius: BAR_RADIUS - RING_WIDTH, overflow: 'hidden' },
  // Theme-tinted, same convention as CuisineDropdown's own frosted panel -
  // a plain blur reads as neutral grey; this ties it back to whatever accent
  // color the user picked. Lower opacity than CuisineDropdown's 0.22 - this
  // bar sits over much livelier, more varied background content (the coin,
  // rolling food, gradients) than that dropdown's flatter backdrop, so a
  // strong tint fought with what was visible through the glass.
  barTint: { ...StyleSheet.absoluteFillObject, opacity: 0.12 },
  // No active/inactive variants anymore - a single shared `highlight` (below)
  // slides between slots instead of each item carrying its own conditional
  // style, so every item now just needs this one plain, stable layout.
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: ITEM_HEIGHT,
  },
  // The sliding highlight itself - absolutely positioned so `translateX` can
  // animate it between slots independent of the icons' own normal flex flow.
  // top:BAR_PADDING/height:56 match where `item`'s own box actually sits
  // inside barInner's padding, so it lines up exactly under whichever icon
  // is active. NO elevation (see frostedGlow's spread in the
  // JSX for why - Android can't render a colored shadow on this transparent
  // glass surface, confirmed on-device) - borderWidth/borderColor come from
  // frostedGlow itself here since, unlike the old per-item approach, this
  // element ONLY ever renders in its "active" form (nothing to pin against
  // an inactive state).
  // left:0, not BAR_PADDING - slotX() (see the component) already bakes
  // BAR_PADDING into the translateX value itself, so this stays the sole
  // origin the transform measures from. Setting both would double-offset it.
  highlight: {
    position: 'absolute',
    left: 0,
    top: BAR_PADDING,
    height: ITEM_HEIGHT,
    borderRadius: 18,
    backgroundColor: `${colors.accent}40`,
  },
});
