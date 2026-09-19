import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useTheme } from '../ThemeContext';

/**
 * Shared dual-tone frosted-glass scaffold (the design canvas's picked button-
 * styling direction, first built for BottomNav.js) - a gradient ring around
 * a real blurred, theme-tinted surface. Extracted here once FilterPanel's
 * travel/rating/cuisine panels and the quick-filter toggles needed the same
 * treatment too, rather than tripling the same ring/blur/tint JSX by hand.
 *
 * The ring is `colors.neon` -> `colors.accentDeep` - both already derive
 * from whatever single accent hue the user picks in Settings > Appearance
 * (see deriveAccentShades in utils/color.js), so this stays customizable
 * through that EXISTING picker with no new UI needed, and always reads as
 * one coherent hue (bright-to-deep) rather than two unrelated colors
 * fighting each other. Original version paired `colors.neon` with the
 * fixed, non-customizable `colors.gold` - a real mismatch for any accent
 * that isn't naturally gold/yellow, and part of why it read as "too strong"
 * (user feedback) alongside the missing-backdrop bug below.
 *
 * `inner`'s explicit dark backgroundColor is load-bearing, not decorative -
 * without it, when this component's own immediate visual backdrop is its
 * OWN gradient ring (unlike BottomNav, which sits over the busier Home
 * screen content), a failed or weak blur pass left the ring's own color
 * dominating the whole panel instead of reading as a thin accent edge
 * around a dark glass surface (caught on-device - this was the real cause,
 * not just an intensity tweak). BottomNav's own barInner already had this
 * same opaque fallback for a related reason (blur failing entirely on some
 * older Android); dropped here during extraction, which is what broke it.
 *
 * `style` goes on the OUTER ring element - sizing props (width, margin) that
 * position this panel on its parent's screen belong there. `contentStyle`
 * goes on the inner content wrapper - padding/alignItems/etc. for whatever
 * you're actually laying out inside. `radius`/`ringWidth` let a caller match
 * its own corner rounding (e.g. a caller that squares off one edge, like
 * FilterPanel's open cuisine trigger). `tintOpacity` lets a caller with a
 * busier backdrop behind it (BottomNav, over the coin/food strip) dial the
 * tint down vs. a flatter one (these panels, over plain background) - same
 * reasoning BottomNav's own barTint comment already spelled out.
 */
// forwardRef so a caller that needs to measure this panel's real on-screen
// position (FilterPanel's Cuisines trigger, measured by App.js to position
// CuisineDropdown flush beneath it) can still attach its own ref to the
// actual outer measurable box, same as before this was extracted.
//
// The ref goes on a plain `View`, NOT the `LinearGradient` - a real,
// on-device crash (TypeError: undefined is not a function, inside
// handleCuisinesExpanded's `cuisineTriggerRef.current.measureInWindow(...)`
// call) confirmed expo-linear-gradient's forwarded ref does NOT expose
// RN's NativeMethods (measureInWindow/measure/etc.) the way a host View's
// ref does - calling it just isn't a function on whatever LinearGradient
// forwards. This was latent since the Cuisines trigger was first wrapped in
// FrostedGlass; every verification pass since then only ever checked the
// COLLAPSED resting state, never actually tapped it open. Fix: the gradient
// ring is now an absolutely-filled decorative layer BEHIND a real outer
// View (which carries the ref), with the inner content inset by `ringWidth`
// via margin instead of the LinearGradient's own padding - same visual
// result, but the measurable box is guaranteed to be a real host View.
const FrostedGlass = React.forwardRef(function FrostedGlass({
  children, style, contentStyle, radius = 15, ringWidth = 1.5,
  tintOpacity = 0.16, blurIntensity = 50, squareBottom = false, collapsable,
}, ref) {
  const { colors } = useTheme();
  const innerRadius = radius - ringWidth;
  // squareBottom: for a panel that squares its bottom corners while open, to
  // read as one continuous piece with something docked flush beneath it
  // (FilterPanel's Cuisines trigger + CuisineDropdown) - has to override the
  // ring, the inner content view, AND the blur/tint layers alike, or the
  // corners mismatch and a visible seam shows through at the boundary.
  const cornerStyle = squareBottom
    ? { borderTopLeftRadius: radius, borderTopRightRadius: radius, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
    : { borderRadius: radius };
  const innerCornerStyle = squareBottom
    ? { borderTopLeftRadius: innerRadius, borderTopRightRadius: innerRadius, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }
    : { borderRadius: innerRadius };

  return (
    <View ref={ref} collapsable={collapsable} style={[cornerStyle, style]}>
      <LinearGradient
        colors={[colors.neon, colors.accentDeep]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={[StyleSheet.absoluteFillObject, cornerStyle]}
      />
      {/* BlurView + tint need their OWN matching border radius +
          overflow:hidden - Android doesn't reliably clip a native BlurView
          to an ancestor's rounded corners via the ancestor's overflow:hidden
          alone (established in CuisineDropdown.js, reused here). margin:
          ringWidth is what reveals the gradient ring painted behind it. */}
      <View style={[styles.inner, innerCornerStyle, contentStyle, { margin: ringWidth }]}>
        <BlurView intensity={blurIntensity} tint="dark" style={[StyleSheet.absoluteFillObject, innerCornerStyle]} />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.accent, opacity: tintOpacity }, innerCornerStyle]}
        />
        {children}
      </View>
    </View>
  );
});

export default FrostedGlass;

const styles = StyleSheet.create({
  // backgroundColor here is the real fix (see the doc comment above) - an
  // opaque dark base underneath blur+tint, not just those two layers alone.
  inner: { overflow: 'hidden', backgroundColor: '#171717' },
});
