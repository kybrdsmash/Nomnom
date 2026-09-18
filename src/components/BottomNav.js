import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { frostedGlow } from '../constants';

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
 * whatever accent color the user picked." The active tab's fill is
 * TRANSLUCENT accent (not the old opaque one) with frostedGlow's desaturated
 * halo, so it still reads as glowing glass rather than a solid button
 * sitting on top of the panel; its icon lights up in colors.neon (the same
 * hue as the ring) instead of the old solid-fill's textDark, since a fully
 * opaque icon color would lose contrast against a now-translucent fill.
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
      <View style={styles.barInner}>
        <BlurView intensity={55} tint="dark" style={styles.barBlur} />
        <View style={[styles.barTint, { backgroundColor: colors.accent }]} pointerEvents="none" />
        {items.map((item) => {
          const active = activeTab === item.key;
          return (
            <Pressable
              key={item.key}
              // frostedGlow's shadowColor/shadowOpacity are iOS-only - Android's
              // `elevation` shadow always renders plain grey/black regardless
              // of shadowColor (a platform limitation, not something this app
              // introduced - every other neonSelected/frostedGlow user has
              // the same grey shadow, just usually blending into an opaque
              // background). This item's cell is fully transparent glass, so
              // that plain grey smudge had nothing to blend into and read as
              // a stray box (caught on-device, twice). Overriding elevation
              // back to 0 here keeps frostedGlow's real border/color intact
              // (still the actual "active" signal) while dropping the shadow
              // Android can't render correctly on a see-through surface.
              style={[styles.item, active && styles.itemActive, active && frostedGlow(colors), active && { elevation: 0 }]}
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
    gap: 6,
    borderRadius: BAR_RADIUS - RING_WIDTH,
    padding: 8,
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
  // NO elevation here, unlike FabMenu's priceBtn/fabSubBtn or FilterPanel's
  // toggleBtnSmall (which pin a constant elevation to dodge a real Android
  // bug: a view going stuck-blank after its OWN elevation changes between
  // renders). Tried that same pin here first and it was wrong for this
  // component specifically - those other buttons always have a real opaque
  // fill, so their constant shadow is invisible-but-harmless at rest and a
  // deliberate glow when active. These cells are meant to be fully flat/
  // transparent at rest (just an icon on the glass pill), and Android's
  // elevation still draws a shadow from a view's BOUNDS regardless of its
  // content's opacity - pinning it here rendered as a visible grey box under
  // every icon, active or not (caught on-device). frostedGlow below still
  // supplies its own elevation only on the active item, which is the one
  // case actually meant to look raised. borderWidth pinned (not elevation)
  // so frostedGlow's own borderWidth arriving on activation doesn't nudge
  // these fixed-width flex siblings.
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  // Translucent (hex + alpha suffix), not the old opaque fill - a frosted
  // "glass" cell should still let the blur underneath read through, even on
  // its active/highlighted state.
  itemActive: {
    backgroundColor: `${colors.accent}40`,
  },
});
