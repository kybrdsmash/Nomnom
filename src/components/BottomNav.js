import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { frostedGlow } from '../constants';

const ITEM_COUNT = 5;
// Must match barInner's own `gap` and `padding` below - the highlight's
// slide destinations are computed analytically from one measured row width
// rather than 5 separate per-item refs, so these two have to stay in sync
// with the actual layout by hand.
const ITEM_GAP = 6;
const BAR_PADDING = 8;

/**
 * Persistent 5-destination bottom nav (Option C from the design canvas
 * review: a floating pill, not a slide-out drawer or a full-width tab bar -
 * picked for tying every destination to exactly 1 tap, matching the
 * clicks-to-action goal, without the drawer's extra tap or the tab bar's
 * permanent full-width footprint).
 *
 * First increment: added alongside FabMenu.js, not replacing it yet -
 * FabMenu also carries the Open Now/Max Price/Favorites-only filter
 * toggles, which are out of scope for a pure navigation shell. Once the My
 * Places hub consolidates Favorites/Try Later/Journal into one destination,
 * FabMenu's remaining nav-only buttons (History/Favorites/TryLater/Journal)
 * become redundant with this and can come out.
 *
 * "Places" doesn't have its own activeView yet (it currently routes to
 * 'favorites', the closest existing screen) - the real My Places hub
 * (Favorites/Try Later/Journal/Friends as tabs in one screen) is its own
 * follow-up increment, not part of this nav-shell pass.
 *
 * Frosted dual-tone-edge glass (design canvas review's pick over plain cool/
 * warm variants): a slim colors.neon-to-colors.gold gradient ring (built via
 * the standard RN "padding trick" - an outer LinearGradient sized to the
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
export default function BottomNav({ activeTab, onSelect }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const items = [
    { key: 'home', label: 'Home' },
    { key: 'places', label: 'Places' },
    { key: 'feast', label: 'Feast' },
    { key: 'history', label: 'History' },
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
    <LinearGradient
      colors={[colors.neon, colors.gold]}
      start={{ x: 0.05, y: 0 }}
      end={{ x: 0.95, y: 1 }}
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
              <NavIcon iconKey={item.key} active={active} colors={colors} />
            </Pressable>
          );
        })}
      </View>
    </LinearGradient>
  );
}

function NavIcon({ iconKey, active, colors }) {
  const color = active ? colors.neon : colors.textMuted;
  const size = 22;
  switch (iconKey) {
    case 'home':
      return <Ionicons name={active ? 'home' : 'home-outline'} size={size} color={color} />;
    case 'feast':
      return <Ionicons name={active ? 'people' : 'people-outline'} size={size} color={color} />;
    case 'history':
      return <Ionicons name={active ? 'book' : 'book-outline'} size={size} color={color} />;
    case 'settings':
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
// noise once shrunk to a real 22px nav icon, same call made in the canvas
// review itself.
function PlacesIcon({ color }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={13} width={5} height={8} stroke={color} strokeWidth={1.6} />
      <Rect x={16} y={10} width={5} height={11} stroke={color} strokeWidth={1.6} />
      <Path d="M12 7a4 4 0 00-4 4c0 4.6 4 10 4 10s4-5.4 4-10a4 4 0 00-4-4z" stroke={color} strokeWidth={1.6} />
      <Circle cx={12} cy={10.5} r={1.3} stroke={color} strokeWidth={1.2} />
      <Path d="M2 21h20" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}

// Ring thickness (px) of the gradient border - the outer LinearGradient is
// sized to the full bar, `barInner` insets by exactly this much via padding,
// so only this sliver of the gradient shows around the blurred panel.
const RING_WIDTH = 1.5;
const BAR_RADIUS = 26;

const makeStyles = (colors) => StyleSheet.create({
  // Shadow/elevation live here (not barInner) - Android's elevation needs
  // an opaque backing to clip its shadow against, and a LinearGradient
  // fully fills its own bounds, so it qualifies same as any solid View.
  barRing: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    borderRadius: BAR_RADIUS,
    padding: RING_WIDTH,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
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
    height: 56,
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
    height: 56,
    borderRadius: 18,
    backgroundColor: `${colors.accent}40`,
  },
});
