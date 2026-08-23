import React, { useRef } from 'react';
import { View, Text, PanResponder, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * A tap/drag segmented control - options can be picked by tapping one
 * directly, or by pressing anywhere in the row and sliding across it.
 * Shared by Settings (coin gesture, units) and the home screen's
 * I-Don't-Care/Elimination mode toggle.
 *
 * Earlier attempts made each segment its own Pressable competing with a
 * PanResponder on the row for touch ownership - which side "won" that
 * negotiation turned out to depend on timing, not direction, so the
 * "broken" side kept flipping between fix attempts instead of actually
 * going away. The fix is architectural: the row is the ONLY touchable
 * here (segments are plain Views), so there's nothing left to compete
 * with - one responder handles both taps and drags identically.
 *
 * `styles` must supply: segmented (row container), segment, segmentActive,
 * segmentText, segmentTextActive - callers own their own visual treatment
 * (e.g. a neon glow on the active segment) via those style objects.
 * `renderOption(option, active)`, if given, replaces the default text label
 * (e.g. for an icon-based control like the travel-type toggle).
 * `gradientColors`, if given (see constants.js's accentGradient(colors)),
 * renders that gradient behind the active segment's content instead of
 * relying on segmentActive's flat backgroundColor alone - opt-in per caller,
 * same "caller owns the visual treatment" contract as everything else here.
 */
export default function SlidableSegmented({ options, value, onChange, styles, renderOption, gradientColors }) {
  const containerRef = useRef(null);
  // Absolute (page) x + width - measured once via measureInWindow rather
  // than relying on touch-event locationX, which is reported relative to
  // whichever view is the current responder rather than a stable anchor.
  const boundsRef = useRef({ pageX: 0, width: 0 });

  const pickFromPageX = (pageX) => {
    const { pageX: originX, width } = boundsRef.current;
    if (!width) return;
    const x = pageX - originX;
    const idx = Math.min(options.length - 1, Math.max(0, Math.floor((x / width) * options.length)));
    const picked = options[idx].value;
    if (picked !== value) onChange(picked);
  };

  // PanResponder.create() only ever runs once - useRef freezes it after the
  // first render - so its callbacks can't just call pickFromPageX directly:
  // that would permanently close over THIS render's `value`/`onChange`,
  // frozen at whatever the control's value was on mount. Every drag to some
  // OTHER value would still fire onChange correctly, but dragging back to
  // that original mount-time value would silently no-op forever (the stale
  // `picked !== value` check thinks it's already there) - stuck unable to
  // return to the default. Same stale-closure bug as CoinSpinner's flick
  // handler; same fix - route through a ref reassigned every render so the
  // frozen callback always reaches the CURRENT pickFromPageX.
  const pickFromPageXRef = useRef(pickFromPageX);
  pickFromPageXRef.current = pickFromPageX;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Fires immediately on touch-down (before any movement), so a plain
      // tap - no drag at all - still selects whichever segment was touched.
      onPanResponderGrant: (evt) => pickFromPageXRef.current(evt.nativeEvent.pageX),
      onPanResponderMove: (evt) => pickFromPageXRef.current(evt.nativeEvent.pageX),
    })
  ).current;

  return (
    <View
      ref={containerRef}
      style={styles.segmented}
      onLayout={() => {
        containerRef.current?.measureInWindow((pageX, _pageY, width) => {
          boundsRef.current = { pageX, width };
        });
      }}
      {...pan.panHandlers}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          // Keying on active state (not just opt.value) forces React to fully
          // unmount/remount this segment's native view whenever it's
          // selected/deselected, instead of restyling the same view in place.
          // The elevation-pinning fix elsewhere wasn't enough on its own - a
          // deselected segment could still be left permanently blank on
          // Android. A fresh native view on every selection change sidesteps
          // whatever stale paint/shadow layer Android was leaving behind,
          // since there's no "in place" view left to go stale.
          <View key={`${opt.value}-${active}`} style={[styles.segment, active && styles.segmentActive]}>
            {active && gradientColors && (
              <LinearGradient
                colors={gradientColors}
                start={{ x: 0.15, y: 0.1 }}
                end={{ x: 0.85, y: 0.95 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            {renderOption ? renderOption(opt, active) : (
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {opt.label}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
