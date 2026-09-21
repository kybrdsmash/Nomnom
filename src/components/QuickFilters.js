import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Text, Animated, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../ThemeContext';
import { frostedGlow } from '../constants';
import FrostedGlass from './FrostedGlass';

const PRICE_LEVELS = [1, 2, 3, 4];

/**
 * Replaces FabMenu.js's hamburger-expand behavior with 3 always-visible
 * frosted-glass toggles (Price/Open Now/Favorites-only) - user request, once
 * BottomNav's own nav-only buttons already made the hamburger's remaining
 * job (these 3 filter toggles) the only thing left in it. Retiring the
 * expand/collapse step entirely matches the "fewer taps" goal the rest of
 * this redesign has been chasing - each toggle is now exactly 1 tap instead
 * of "tap hamburger, THEN tap toggle."
 *
 * Price has no on/off state, just 4 levels plus "off" - rather than expand a
 * row of 4 buttons (FabMenu's old approach), a single button cycles through
 * them (1→2→3→4→off→1...), showing the current level as its own label so it
 * never needs to expand into anything.
 */
// Fallback only, used for the one frame before onLayout below reports the
// stack's REAL rendered height - was the only source of truth before (3
// toggles at toggleRing's declared 38px, plus stack's own 10px gap: 38*3 +
// 10*2 = 134, half 67), which left a small but real ~18px residual offset
// on-device (measured directly against the coin's own pixels) once the
// coin-centering fix itself was already working - the declared 38px
// doesn't necessarily match how tall the toggle actually paints once
// FrostedGlass/frostedGlow's own rendering is factored in. Measuring is
// exact regardless of why the guess was off; guessing a corrected constant
// would just trade one unverified number for another.
const STACK_HALF_HEIGHT_FALLBACK = 67;

export default function QuickFilters({
  visible, openNowOnly, onToggleOpenNow, favoritesOnly, onToggleFavoritesOnly,
  maxPrice, setMaxPrice, hapticsEnabled = true, centerY,
  reallyGoodOnly, onToggleReallyGood,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [stackHalfHeight, setStackHalfHeight] = useState(null);
  const stackRef = useRef(null);

  if (!visible) return null;

  const cyclePrice = () => {
    if (maxPrice == null) { setMaxPrice(PRICE_LEVELS[0]); return; }
    const idx = PRICE_LEVELS.indexOf(maxPrice);
    setMaxPrice(idx === PRICE_LEVELS.length - 1 ? null : PRICE_LEVELS[idx + 1]);
  };

  // Was a fixed `bottom: 170` in `stack` itself - close on the device it was
  // tuned against, but the coin's real Y comes out of flex layout
  // (space-between, vscale-dependent padding), so a hand-picked number
  // drifted off-center elsewhere (user report: "the 3 small selector...
  // are not centered with the nom nom coin"). `centerY` (App.js measures it
  // off the coin's own wrapper) lets this center on the coin's actual
  // midpoint instead; falls back to the old fixed value for the one frame
  // before that measurement resolves, so nothing jumps on mount.
  const halfHeight = stackHalfHeight != null ? stackHalfHeight : STACK_HALF_HEIGHT_FALLBACK;
  // Was a hardcoded +25dp correction, tuned from ONE screenshot on ONE
  // device (a Pixel) - a second device (a tablet) confirmed that same
  // constant overshoots the OTHER direction there. Removed, then verified
  // via real measureInWindow data (App.js's measureCoin + this component's
  // own onLayout, both logging their true window-absolute center) that the
  // plain centerY - halfHeight formula lands EXACTLY on the coin's true
  // geometric center on a Pixel - the two independently-measured
  // trueCenterY values matched to the fraction. So the bounding-box math
  // itself was never wrong.
  //
  // What's still off is the coin's PERCEIVED visual center vs. its
  // geometric one - CoinSpinner.js's groundShadow sits mostly below the
  // coin's own 160px box (top: 150, height: 24, i.e. ~14px of it hangs past
  // the coin's bottom edge), and that extra dark visual mass reads as part
  // of "the coin" to the eye, pulling its perceived center down without
  // moving its measured bounding box at all (user report, live: "the quick
  // menu is hovering higher than it should if it were centered on the
  // coin"). Nudging down by half that overhang (~7dp) targets the coin's
  // visual weight instead of its box - and unlike the old +25dp hack, this
  // number comes from a fixed, unscaled asset dimension in CoinSpinner.js
  // (never run through vscale), not a screenshot guess, so it should hold
  // up across devices the same +25dp never did.
  const COIN_SHADOW_VISUAL_OFFSET = 7;
  const verticalStyle = centerY != null
    ? { top: centerY - halfHeight + COIN_SHADOW_VISUAL_OFFSET }
    : { bottom: 170 };

  return (
    <View
      ref={stackRef}
      style={[styles.stack, verticalStyle]}
      pointerEvents="box-none"
      onLayout={(e) => {
        // Only ever set this ONCE (guarded on still being null) - the
        // content here is a fixed set of toggles at a fixed size, so its
        // real height never actually changes after the first measurement.
        // Setting it unconditionally on every onLayout created a real
        // feedback loop: this state feeds verticalStyle's `top`, changing
        // `top` moves the view, and a moved absolutely-positioned view
        // fires onLayout AGAIN (position changes count as a layout change,
        // not just size) - with sub-pixel rounding differing just enough
        // each time to never converge, this ping-ponged forever (confirmed
        // live: rapid-fire logs alternating between two near-identical
        // heights). That constant re-render/re-measure churn was very
        // likely also behind unrelated reports of the whole app feeling
        // sluggish (e.g. slow nav-tab switches) - this was a real
        // performance bug, not just a cosmetic one.
        if (stackHalfHeight == null) setStackHalfHeight(e.nativeEvent.layout.height / 2);
      }}
    >
      <Toggle active={maxPrice != null} onPress={cyclePrice} colors={colors} styles={styles} hapticsEnabled={hapticsEnabled} order={0}>
        {maxPrice != null ? (
          // $$$$ (4 characters) didn't fit this toggle's small circle
          // (user report) - $4 shows a money bag emoji instead of a 4th $,
          // guaranteed to render without needing to guess an exact glyph
          // name from whichever icon font happens to have one.
          maxPrice === 4 ? (
            // priceText's fontSize:13 was tuned for $/$$/$$$ text width, not
            // a single emoji glyph - a bit bigger here reads clearly at the
            // same visual weight as the other toggles' 20-24px icons.
            <Text style={{ fontSize: 18 }}>💰</Text>
          ) : (
            <Text style={[styles.priceText, { color: colors.neon }]}>{'$'.repeat(maxPrice)}</Text>
          )
        ) : (
          <Ionicons name="cash-outline" size={20} color={colors.textMuted} />
        )}
      </Toggle>
      <Toggle active={openNowOnly} onPress={onToggleOpenNow} colors={colors} styles={styles} hapticsEnabled={hapticsEnabled} order={1}>
        <MaterialCommunityIcons
          name={openNowOnly ? 'clock-check' : 'clock-check-outline'}
          size={22}
          color={openNowOnly ? colors.neon : colors.textMuted}
        />
      </Toggle>
      <Toggle active={favoritesOnly} onPress={onToggleFavoritesOnly} colors={colors} styles={styles} hapticsEnabled={hapticsEnabled} order={2}>
        <Ionicons
          name={favoritesOnly ? 'heart-circle' : 'heart-circle-outline'}
          size={24}
          color={favoritesOnly ? colors.neon : colors.textMuted}
        />
      </Toggle>
      {/* "Really Freaking Good" (user request) - a much stricter quality bar
          than the normal minRating slider, see places.js's filterReallyGood. */}
      <Toggle active={reallyGoodOnly} onPress={onToggleReallyGood} colors={colors} styles={styles} hapticsEnabled={hapticsEnabled} order={3}>
        <Ionicons
          name={reallyGoodOnly ? 'flame' : 'flame-outline'}
          size={22}
          color={reallyGoodOnly ? colors.neon : colors.textMuted}
        />
      </Toggle>
    </View>
  );
}

// Trying out FaveCuisineButton.js's "attract pulse" (two soft glow + scale
// bounces, then settle - never a persistent glow, so it can't turn into a
// permanently-ignored notification dot) on these 3 toggles, since they're
// the most likely to go unnoticed among everything else on Home (user
// request, part of solving discoverability for Favorites-only spinning).
// Currently fires once on every mount (i.e. every time Home's QuickFilters
// remounts) as a first pass to evaluate the feel - if this sticks, the next
// step is gating it behind a real "has the user ever tried this" flag
// (AsyncStorage, same convention as storage.js's seen-ids) so it only plays
// once ever, likely just on the Favorites-only toggle rather than all 3.
// `order` staggers the 3 pulses slightly so they read as a small wave down
// the stack rather than all 3 flashing in perfect unison.
function Toggle({ active, onPress, children, colors, styles, hapticsEnabled, order = 0 }) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const onePulse = () => Animated.parallel([
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 1.08, duration: 220, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(pulseGlow, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(pulseGlow, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]),
    ]);
    // Was two onePulse() calls back-to-back ("two soft glow + scale
    // bounces") - since QuickFilters fully unmounts/remounts every time you
    // leave and return to Home, that meant a real double-bounce every single
    // time (user report: "they do a click wave thing... but they do it
    // twice"). One is enough to draw the eye without reading as excessive.
    Animated.sequence([Animated.delay(order * 90), onePulse()]).start();
  }, []);

  const handlePress = () => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
      <FrostedGlass
        style={styles.toggleRing}
        contentStyle={styles.toggleInner}
        radius={19}
        tintOpacity={active ? 0.28 : 0.12}
      >
        <Pressable
          style={[styles.toggleTouch, active && frostedGlow(colors), active && { elevation: 0 }]}
          onPress={handlePress}
          hitSlop={6}
        >
          {children}
        </Pressable>
      </FrostedGlass>
      {/* Sits OUTSIDE FrostedGlass's own inner view on purpose - that inner
          view is overflow:hidden (see FrostedGlass.js), which would clip the
          scale bounce and glow ring right at the button's own edge instead
          of letting either breathe past it. */}
      <Animated.View pointerEvents="none" style={[styles.pulseRing, { opacity: pulseGlow }]} />
    </Animated.View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // Same corner (bottom-right, above where the coin/nav sit) FabMenu used to
  // occupy - right:30 lines up with FabMenu's old anchor; bottom:170 clears
  // both the coin (roughly centered above BottomNav) and BottomNav's own
  // ~94px-tall footprint at the very bottom of the screen.
  // No bottom/top here - that's applied dynamically via verticalStyle above.
  stack: { position: 'absolute', right: 30, alignItems: 'center', gap: 10, zIndex: 45 },
  toggleRing: { width: 38, height: 38 },
  toggleInner: { flex: 1 },
  toggleTouch: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, borderWidth: 1.5, borderColor: 'transparent',
  },
  priceText: { fontWeight: 'bold', fontSize: 13 },
  // The attract-pulse glow ring (see Toggle's docstring) - opacity-only,
  // borderWidth stays fixed, matching FaveCuisineButton's same convention
  // for a border that reacts to state without nudging fixed-width neighbors.
  // absoluteFillObject here sizes against the outer Animated.View, which in
  // turn sizes to toggleRing's own 38x38 (its only non-absolute child) - so
  // this ring always matches the button's real footprint with no hand-kept
  // duplicate width/height.
  pulseRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.neon,
  },
});
