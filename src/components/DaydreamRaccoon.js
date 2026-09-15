import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, PanResponder, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../ThemeContext';
import { neonSelected, accentGradient, useVerticalScale } from '../constants';
import { FOODS } from '../foods';

const CYCLE_MS = 2200; // how long each food stays up before crossfading
const FADE_MS = 280;
// Same convention as RollingFoodStrip's rollers (createRollerPanResponder) -
// held past this without moving opens the detail view; released sooner (or
// after moving past DRAG_CANCEL_PX) counts as a tap instead.
const LONG_PRESS_MS = 500;
const DRAG_CANCEL_PX = 10;
// How long the bubble stays paused on its food after the detail view closes,
// before rolling resumes on its own (user request: "give the user a second
// to still maybe click on the food item in case it was an accident").
const RESUME_GRACE_MS = 1500;
// A plain tap-pause (no detail view involved) used to stay paused forever
// until tapped again - now it also resumes on its own once left untouched
// this long (user request, starting value to try).
const TAP_PAUSE_RESUME_MS = 1000;

// Used to be a flat white fill ("a real bubble, not themed") with just a
// neon ring following the theme - now the same glossy accent gradient every
// other selected/highlighted element in the app uses (user request), with a
// neon ring on top same as before. The trail dots stay plain white - they're
// tiny (5-8px), too small for a gradient to read as anything but noise.
const BUBBLE_FILL = '#FFFFFF';

const RACCOON_ASPECT = 661 / 324;
const RACCOON_HEIGHT = 70; // half the original size (user feedback: was too big)

/**
 * The home screen's "saucy raccoon daydreaming about food" header. The
 * raccoon body is a static illustration; the thought bubble is drawn in
 * code (not baked into the art) so its contents can actually cycle - a new
 * food icon crossfades in every couple of seconds, looping through the
 * whole FOODS list. The bubble + trailing dots run diagonally from just
 * above the raccoon's head up toward the top-left corner, classic
 * thought-bubble style, rather than sitting on top of its face.
 *
 * Tap the bubble to pause on whatever food is currently showing (tap again
 * to resume); long-press it to open that food's detail view, exactly like
 * RollingFoodStrip's rollers (user request - same info should be reachable
 * from here, not just the strip). One PanResponder resolves both, same
 * reasoning as every other tap+long-press control in this codebase (see
 * RollingFoodStrip's own docstring): a Pressable nested here would fight a
 * PanResponder for touch ownership.
 *
 * Neither kind of pause lasts forever (user request) - a plain tap-pause
 * resumes on its own after TAP_PAUSE_RESUME_MS of being left untouched; a
 * long-press pause doesn't resume the instant the detail view closes either,
 * RESUME_GRACE_MS gives the user a beat to tap/long-press it again first, in
 * case closing it was itself the accident.
 */
export default function DaydreamRaccoon({ onLongPressFood, foodDetailOpen = false }) {
  const { colors } = useTheme();
  const vscale = useVerticalScale();
  const styles = makeStyles(colors, vscale);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  // Read inside the interval/PanResponder callbacks below, which close over
  // whatever `index`/`paused` were at effect-setup time otherwise - same
  // stale-closure fix used throughout this codebase (RollingFoodStrip,
  // FilterPanel, SettingsPanel).
  const indexRef = useRef(index);
  indexRef.current = index;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  // True only while the current pause was caused by a long-press (vs. a
  // plain tap) - only that kind gets the grace-then-auto-resume treatment
  // below, so a deliberate tap-to-pause still stays put indefinitely.
  const pausedByLongPressRef = useRef(false);
  const resumeTimerRef = useRef(null);
  const clearResumeTimer = () => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  };

  // Watches foodDetailOpen for a true->false edge (the detail view just
  // closed), not just its current value - only fires the grace timer once,
  // right at that transition.
  const wasDetailOpenRef = useRef(foodDetailOpen);
  useEffect(() => {
    const wasOpen = wasDetailOpenRef.current;
    wasDetailOpenRef.current = foodDetailOpen;
    if (wasOpen && !foodDetailOpen && pausedByLongPressRef.current) {
      clearResumeTimer();
      resumeTimerRef.current = setTimeout(() => {
        pausedByLongPressRef.current = false;
        restartCycleRef.current();
        setPaused(false);
      }, RESUME_GRACE_MS);
    }
  }, [foodDetailOpen]);

  useEffect(() => () => clearResumeTimer(), []);

  // Self-rescheduling setTimeout chain, not setInterval - an interval left
  // running through a pause just keeps ticking on its ORIGINAL schedule
  // underneath (each tick still fires, it just no-ops while paused), so
  // resuming could land anywhere up to a full CYCLE_MS after the pause
  // actually lifted - on top of the grace wait, that read as "waited and it
  // never continued" (user report). restartCycleRef lets both resume paths
  // below (tap and the grace timer) force a clean, predictable CYCLE_MS from
  // the moment they actually resume, instead of whatever was left on a
  // schedule that was already running before the pause even started.
  const cycleTimerRef = useRef(null);
  const runCycleTick = () => {
    if (!pausedRef.current) {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
        if (pausedRef.current) return;
        setIndex((i) => (i + 1) % FOODS.length);
        Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      });
    }
    cycleTimerRef.current = setTimeout(runCycleTick, CYCLE_MS);
  };
  const runCycleTickRef = useRef(runCycleTick);
  runCycleTickRef.current = runCycleTick;
  const restartCycle = () => {
    if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    cycleTimerRef.current = setTimeout(() => runCycleTickRef.current(), CYCLE_MS);
  };
  const restartCycleRef = useRef(restartCycle);
  restartCycleRef.current = restartCycle;

  useEffect(() => {
    cycleTimerRef.current = setTimeout(() => runCycleTickRef.current(), CYCLE_MS);
    return () => clearTimeout(cycleTimerRef.current);
  }, []);

  const gestureRef = useRef({ startX: 0, startY: 0, dragging: false, longPressTimer: null, longPressFired: false });
  const clearLongPressTimer = () => {
    const g = gestureRef.current;
    if (g.longPressTimer) {
      clearTimeout(g.longPressTimer);
      g.longPressTimer = null;
    }
  };
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const g = gestureRef.current;
        g.startX = evt.nativeEvent.pageX;
        g.startY = evt.nativeEvent.pageY;
        g.dragging = false;
        g.longPressFired = false;
        clearLongPressTimer();
        g.longPressTimer = setTimeout(() => {
          g.longPressFired = true;
          // Pause on whatever's showing right now, same as a tap would -
          // otherwise the bubble kept cycling underneath the just-opened
          // detail view, which read as broken (user report). Cancel any
          // grace-resume still pending from a PREVIOUS long-press (opening
          // it again mid-grace-window should reset the clock, not let that
          // old timer resume rolling out from under the newly-reopened view).
          clearResumeTimer();
          pausedByLongPressRef.current = true;
          setPaused(true);
          onLongPressFood?.(FOODS[indexRef.current]);
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (evt) => {
        const g = gestureRef.current;
        const dx = evt.nativeEvent.pageX - g.startX;
        const dy = evt.nativeEvent.pageY - g.startY;
        if (!g.dragging && Math.sqrt(dx * dx + dy * dy) > DRAG_CANCEL_PX) {
          g.dragging = true;
          clearLongPressTimer();
        }
      },
      onPanResponderRelease: () => {
        const g = gestureRef.current;
        clearLongPressTimer();
        if (g.longPressFired || g.dragging) return;
        clearResumeTimer();
        pausedByLongPressRef.current = false;
        if (pausedRef.current) {
          // Was paused - this tap resumes it right now.
          restartCycleRef.current();
          setPaused(false);
        } else {
          // Was rolling - this tap pauses it, but only for a beat (user
          // request) - left untouched, it starts rolling again on its own
          // rather than staying paused forever like it used to.
          setPaused(true);
          resumeTimerRef.current = setTimeout(() => {
            restartCycleRef.current();
            setPaused(false);
          }, TAP_PAUSE_RESUME_MS);
        }
      },
      onPanResponderTerminate: clearLongPressTimer,
    })
  ).current;

  return (
    <View style={styles.wrap}>
      <Image
        source={require('../../assets/daydream-raccoon.png')}
        style={styles.raccoon}
        resizeMode="contain"
      />
      <View style={styles.trailDotSmall} />
      <View style={styles.trailDotBig} />
      {/* Without this, Android's view-flattening optimization can drop this
          plain View from the native tree entirely (it has nothing but
          layout + elevation to justify its own native backing view), which
          means the permanent elevation:10 from neonSelected silently never
          exists as a real layer on some devices/GPU drivers once its
          native-driven Animated.Image child gets promoted onto its own
          compositing layer - same combination (elevation + native-driven
          animated child + no flattening guard) as the already-fixed
          RollingFoodStrip.js/App.js topControlsScroll bugs (see
          RollingFoodStrip.js's own collapsable={false} comment for the
          fuller root-cause story), just hasn't been hit here yet. This
          bubble sits absolutely positioned near the top of a scrolling
          container that itself has elevation:15 (App.js's
          topControlsScroll), so it's exactly the same risk shape. */}
      <View style={styles.bubble} collapsable={false}>
        <LinearGradient {...accentGradient(colors)} style={StyleSheet.absoluteFill} />
        <Animated.Image source={FOODS[index].image} style={[styles.foodIcon, { opacity }]} resizeMode="contain" />
      </View>
      {/* Real geometry, not hitSlop - same reasoning as RollingFoodStrip's
          touchArea (a bare View + PanResponder has no hitSlop prop). The
          bubble itself is only 34x34; this extends the actual touchable
          region well past its visible edge without changing how it looks. */}
      <View style={styles.bubbleTouchArea} {...panResponder.panHandlers} />
    </View>
  );
}

const makeStyles = (colors, vscale = 1) => StyleSheet.create({
  // marginTop deliberately NOT scaled by vscale - the thought bubble sits
  // absolutely positioned at top:-26 relative to this box (see `bubble`
  // below), so shrinking this margin much below that risks the bubble
  // clipping against the scroll container's top edge. marginBottom is pure
  // spacing below the raccoon with nothing relying on it, so that one scales
  // freely (see useVerticalScale in constants.js).
  wrap: { height: RACCOON_HEIGHT, width: RACCOON_HEIGHT * RACCOON_ASPECT, alignSelf: 'center', marginTop: 30, marginBottom: 6 * vscale },
  raccoon: { width: '100%', height: '100%' },
  // Furthest from the head, up in the top-left corner - the "source" of the
  // daydream visually terminates here.
  bubble: {
    position: 'absolute',
    top: -26,
    left: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: BUBBLE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...neonSelected(colors),
  },
  foodIcon: { width: 22, height: 24 },
  // Same top/left as `bubble` above, expanded 40px on every side - centers
  // a much bigger touch region over the visible 34x34 bubble. A smaller
  // expansion (14px) still wasn't reliably catching a long-press (user
  // report: "such a small image") - a finger fully occludes a target this
  // size, so the touchable area needs to be generous, not just "a bit
  // bigger than the art".
  bubbleTouchArea: {
    position: 'absolute', top: -26 - 40, left: -4 - 40, width: 34 + 80, height: 34 + 80,
  },
  // Mid-sized dot, between the bubble and the head. Thin neon-colored
  // border only, no full glow/shadow - at this size that'd read as a blob.
  trailDotBig: {
    position: 'absolute', top: -10, left: 10,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: BUBBLE_FILL, borderWidth: 1.2, borderColor: colors.neon,
  },
  // Smallest dot, right above the head where the daydream "starts".
  trailDotSmall: {
    position: 'absolute', top: -2, left: 22,
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: BUBBLE_FILL, borderWidth: 1, borderColor: colors.neon,
  },
});
