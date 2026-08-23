import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet, useWindowDimensions, Easing } from 'react-native';
import { createFoodPicker } from '../foods';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';

// Doubled (34 -> 68), then another 50% on top of that (68 -> 102), then
// brought back down (102 -> 70) once the bigger size read as too big for the
// gap between the mode toggle and the Cuisines trigger (user request).
// `label`'s vertical offset and OVERLAP_THRESHOLD both derive from this
// constant already, so they scale with it automatically; `strip`'s own
// container height also derives from it (ICON_SIZE + 10). `touchArea`'s
// enlarged hit box below is fixed padding, not derived from ICON_SIZE - a
// generous fixed-size touch area around a smaller icon is still fine (if
// anything, easier to hit a smaller moving target), so it's left as-is.
const ICON_SIZE = 70;
const MIN_SPAWN_DELAY_MS = 2500;
const MAX_SPAWN_DELAY_MS = 6000;
const MIN_TRIP_MS = 4500;
const MAX_TRIP_MS = 7500;
const MAX_CONCURRENT = 2;
const ROTATION_MS = 900; // one full spin per lap - reads as rolling, not spinning wildly
// Two rollers count as "visually on top of each other" when their frozen
// X positions land within this many pixels of one another.
const OVERLAP_THRESHOLD = ICON_SIZE * 0.8;
// Which side of the screen a paused icon's name pops out on - left 30% of
// the strip gets a right-side label (room to the right), everything past
// that gets a left-side label (room to the left) - matches the direction
// each one actually has more open space in.
const LEFT_ZONE_FRACTION = 0.3;
// How far (px) a swipe on a PAUSED icon has to travel before it counts as
// "toss this off the screen" rather than just a wobble (user request: swipe
// a stopped food left/right to fling it off that side quickly).
const TOSS_SWIPE_THRESHOLD = 40;
// Movement past this cancels the long-press-to-open-detail timer and
// commits to treating the gesture as a drag instead of a tap/hold.
const DRAG_CANCEL_PX = 10;
const LONG_PRESS_MS = 500;
// Quick, not a lazy roll-off - this is a deliberate fling, so it covers the
// remaining distance to the edge much faster than a normal trip would.
const TOSS_DURATION_MS = 280;

// How many already-exited foods stay recoverable by rewinding the strip
// (user request: "at least the last 3 food which have rolled off screen").
const HISTORY_LIMIT = 3;
// Scrubbing the background is quadratic in per-event finger speed, not 1:1
// with finger distance (user request: "distance travelled is a square of
// the rate of the user's finger swiping... slow movement means slow rewind
// / forward, fast movement means really rewinding or fast forwarding") - a
// slow drag barely nudges the icons, a fast flick eats through several at
// once. Tuned by feel; there's no principled "correct" value here. Was 0.3,
// brought down to 0.12 (~40%) after it read as too fast even for a normal-
// speed drag (user report).
const SCRUB_GAIN = 0.12;
// Clamps a single move-event's scrub distance (as a multiple of screen
// width) so one abnormally large event (a dropped-frame glitch, or just an
// extreme flick) can't fling everything off screen / drain the whole
// history buffer in one tick. Brought down alongside SCRUB_GAIN (was 1.5)
// so even the hardest flick tops out lower, not just normal-speed drags.
const MAX_SCRUB_STEP_FACTOR = 0.8;

const randomBetween = (min, max) => min + Math.random() * (max - min);

/**
 * Interactive filler for the gap between the Cuisines section and the mode
 * toggle: food icons randomly roll in from the left edge at varying speeds
 * (some visibly overtake others), tumble across, and roll off the right.
 * Tapping one freezes it in place (and any other roller it's currently
 * overlapping) and pops its name out to whichever side has more room;
 * tapping a frozen one again sends it back on its way from where it
 * stopped. While paused, swiping it left/right instead flings it off that
 * side of the screen quickly, skipping the rest of its normal trip (user
 * request). Long-pressing (rolling or paused) opens a detail view for that
 * dish - description, allergens, cultural background, and a nearby-
 * restaurant search - via `onLongPressFood`, independent of the tap/pause/
 * toss state. Reuses the shared food-icon pool (src/foods.js).
 *
 * Swiping anywhere on the strip's BACKGROUND (not on an icon itself, which
 * keeps its own tap/toss/long-press gestures above) scrubs time forward or
 * backward instead: dragging right fast-forwards the currently visible
 * icons (pulling in genuinely new ones from the shuffle bag as they exit),
 * dragging left rewinds them (pulling back up to the last HISTORY_LIMIT
 * icons that already rolled off, in reverse order) - user request. There's
 * no persistent record of rolling food beyond that short in-memory buffer;
 * everything resets on remount.
 *
 * Tap, long-press, and swipe-to-toss are all resolved by hand from one
 * PanResponder per roller (created once, at spawn) rather than a
 * Pressable+PanResponder combo - this codebase has a standing bug class
 * where the two fight over touch ownership (see SlidableSegmented's
 * history with that exact problem). The new background scrub gesture lives
 * on a SEPARATE PanResponder on the strip container itself - RN's touch
 * hit-testing tries the deepest view under the touch first, so a touch
 * starting on a roller's own (enlarged) touchArea still claims that
 * roller's responder before the container ever gets asked; only touches
 * starting in genuinely empty background go to the scrub gesture.
 */
export default function RollingFoodStrip({ onLongPressFood }) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [rollers, setRollers] = useState([]);
  const rollersRef = useRef([]);
  const timeoutRef = useRef(null);
  // Own shuffle-bag picker (see createFoodPicker in foods.js), independent
  // from the coin's and raccoon's - every food rolls through once before
  // any repeat.
  const pickFood = useRef(createFoodPicker()).current;
  // Small ring buffer of the most recently EXITED-RIGHT foods (oldest
  // first), so rewinding can pull real previously-seen dishes back onto
  // screen instead of just stopping dead once there's nothing left to
  // drag. Capped at HISTORY_LIMIT - popped from the end (most recent
  // exit first) as the rewind gesture consumes it.
  const historyRef = useRef([]);

  const setRollersBoth = (next) => {
    rollersRef.current = next;
    setRollers(next);
  };

  // Pure roller construction - does NOT touch state, callers add the
  // result themselves. `startX` overrides the default spawn edge (used by
  // the scrub gesture, which places a newly-revealed icon wherever the
  // leftover drag distance lands it); `food` overrides the shuffle-bag
  // pick (used to restore a specific dish from historyRef while
  // rewinding). `animate: false` builds the roller frozen in place with no
  // running animation - used mid-scrub, since the gesture itself is
  // currently in control of its position; resumeAll (below) starts it
  // rolling normally once the gesture ends, exactly like every other
  // currently-visible roller.
  const buildRoller = ({ startX, food, animate = true } = {}) => {
    const id = Math.random().toString(36).slice(2);
    const initialX = startX != null ? startX : -ICON_SIZE;
    const translateX = new Animated.Value(initialX);
    const rotate = new Animated.Value(0);
    const currentXRef = { current: initialX };
    const listenerId = translateX.addListener(({ value }) => { currentXRef.current = value; });
    // Mirrors currentXRef above - keeps a plain, synchronously-readable
    // copy of `rotate`'s current angle updated as the native-driven
    // animation runs, so pausing/scrubbing can freeze it exactly without
    // needing stopAnimation()'s async native round-trip (see the comment
    // on the pause branch below for why that was still racy).
    const currentRotateRef = { current: 0 };
    const rotateListenerId = rotate.addListener(({ value }) => { currentRotateRef.current = value; });
    // resetBeforeIteration: false - Animated.loop otherwise resets its
    // value back to whatever it was AT CONSTRUCTION TIME (0) before every
    // single .start() call, not just the first. That's invisible during
    // uninterrupted rolling, but freezing `rotate` mid-spin at some
    // non-boundary value and later restarting the loop needs it to
    // continue from wherever `rotate` actually is, not snap back to 0.
    const rotateAnim = Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: ROTATION_MS, easing: Easing.linear, useNativeDriver: true }),
      { resetBeforeIteration: false }
    );
    const tripDuration = randomBetween(MIN_TRIP_MS, MAX_TRIP_MS);
    const roller = {
      id, food: food || pickFood(), translateX, rotate, rotateAnim, currentXRef, listenerId,
      currentRotateRef, rotateListenerId, tripDuration, paused: false,
    };
    // Built once here (not per-render) and kept for the roller's whole
    // lifetime - see createRollerPanResponder below for why tap/long-
    // press/swipe-toss all need to be resolved by one responder.
    roller.panResponder = createRollerPanResponder(id);
    if (animate) {
      rotateAnim.start();
      // Linear, not eased - a background decoration rolling at a steady
      // pace reads as "rolling"; easing in/out would look like it was
      // accelerating or braking for no reason.
      Animated.timing(translateX, {
        toValue: width + ICON_SIZE,
        duration: tripDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) exitRollerRef.current(id);
      });
    }
    return roller;
  };

  // The one place a roller ever fully leaves the strip having completed a
  // rightward trip (natural roll-off, a tap-resume finishing its trip, or
  // a rightward toss) - always feeds history, since it made it all the way
  // across and is fair game to rewind back. `feedsHistory: false` is only
  // used for a LEFTWARD exit (tossed off the left, or scrubbed backward
  // past the start) - that's a deliberate discard, not a completed trip,
  // so there's nothing there worth remembering.
  const exitRoller = (id, { feedsHistory = true } = {}) => {
    const roller = rollersRef.current.find((r) => r.id === id);
    if (!roller) return;
    roller.rotateAnim.stop();
    roller.translateX.removeListener(roller.listenerId);
    roller.rotate.removeListener(roller.rotateListenerId);
    if (feedsHistory) {
      historyRef.current = [...historyRef.current, roller.food].slice(-HISTORY_LIMIT);
    }
    setRollersBoth(rollersRef.current.filter((r) => r.id !== id));
  };
  // buildRoller's own completion callback fires asynchronously, whenever
  // that specific animation naturally finishes (long after this render is
  // gone) - same stale-closure hazard as the drag-math refs elsewhere in
  // this codebase (SlidableSegmented, FilterPanel), same fix.
  const exitRollerRef = useRef(exitRoller);
  exitRollerRef.current = exitRoller;

  const handleTapRoller = (id) => {
    const roller = rollersRef.current.find((r) => r.id === id);
    if (!roller) return;

    if (roller.paused) {
      // Resume from exactly where it stopped, at the same steady pace it
      // was already going (a proportional slice of its original duration,
      // not a fresh full-length trip) so it doesn't visibly change speed.
      const remainingDistance = (width + ICON_SIZE) - roller.currentXRef.current;
      const totalDistance = width + ICON_SIZE * 2;
      const remainingDuration = Math.max(300, roller.tripDuration * (remainingDistance / totalDistance));
      roller.rotateAnim.start();
      Animated.timing(roller.translateX, {
        toValue: width + ICON_SIZE,
        duration: remainingDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) exitRollerRef.current(roller.id);
      });
      setRollersBoth(rollersRef.current.map((r) => (r.id === id ? { ...r, paused: false } : r)));
      return;
    }

    // Pausing: also catch any other still-rolling icon currently overlapping
    // this one, so both names show (user feedback - "if they seem visually
    // on top of each other").
    const thisX = roller.currentXRef.current;
    const toPause = rollersRef.current.filter(
      (r) => !r.paused && (r.id === id || Math.abs(r.currentXRef.current - thisX) < OVERLAP_THRESHOLD)
    );
    toPause.forEach((r) => {
      // Must sync the JS-side value, not just call stopAnimation() bare - on
      // Android, a native-driven Animated.Value left un-synced after
      // stopAnimation() can make the NEXT Animated.timing (on resume, below)
      // start from a stale old value instead of wherever it actually
      // visually stopped, which looked like the roller froze and never
      // continued after being tapped again (user feedback).
      //
      // Both values read from their own live-tracked ref (currentXRef /
      // currentRotateRef, both kept current by a listener added at spawn)
      // rather than stopAnimation(callback) - that callback resolves through
      // an async round-trip to the native side, and if a resume happens
      // before that round-trip lands, its setValue() arrives AFTER the new
      // resume animation has already started and (setValue always stops
      // whatever animation is currently running on a value) yanks it right
      // back to the stale pre-pause position - "stutters and doesn't roll"
      // after being tapped to resume (user report). translateX used to still
      // do this the racy way even after rotate was fixed for the identical
      // race, which is exactly why the stutter persisted for the position
      // (not just the rotation) on a quick pause-then-resume.
      r.translateX.stopAnimation();
      r.translateX.setValue(r.currentXRef.current);
      r.rotate.setValue(r.currentRotateRef.current);
    });
    const pausedIds = new Set(toPause.map((r) => r.id));
    setRollersBoth(rollersRef.current.map((r) => (pausedIds.has(r.id) ? { ...r, paused: true } : r)));
  };

  // Flings a PAUSED roller off the given side quickly, skipping the rest of
  // its normal trip (user request). Re-starts the spin for the fling (same
  // as a normal resume) and, on completion, cleans up exactly like a roller
  // finishing its trip naturally does. Only a rightward toss feeds history
  // (see exitRoller above) - flinging one off the left is a deliberate
  // "get rid of this," not a completed trip worth rewinding back to.
  const tossRoller = (id, direction) => {
    const roller = rollersRef.current.find((r) => r.id === id);
    if (!roller) return;
    const target = direction === 'left' ? -ICON_SIZE : width + ICON_SIZE;
    roller.rotateAnim.start();
    Animated.timing(roller.translateX, {
      toValue: target,
      duration: TOSS_DURATION_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) exitRollerRef.current(id, { feedsHistory: direction !== 'left' });
    });
    // Unpause immediately so the name label disappears the instant it
    // starts flying, rather than lingering next to a rapidly departing icon.
    setRollersBoth(rollersRef.current.map((r) => (r.id === id ? { ...r, paused: false } : r)));
  };

  // One PanResponder per roller, built once at spawn and kept for its whole
  // lifetime, resolving tap/long-press/swipe-toss by hand:
  //  - released with barely any movement -> tap (handleTapRoller)
  //  - held past LONG_PRESS_MS without moving -> open the food detail view
  //  - dragged past TOSS_SWIPE_THRESHOLD horizontally WHILE PAUSED -> toss
  //    it off in that direction instead
  // A still-rolling (not yet paused) icon ignores drags entirely and only
  // responds to tap/long-press - swiping something that's still moving
  // isn't a gesture this component supports (the ask was specifically about
  // a stopped icon).
  const createRollerPanResponder = (id) => {
    const gesture = { startX: 0, startY: 0, dragging: false, longPressTimer: null, longPressFired: false };
    const clearLongPressTimer = () => {
      if (gesture.longPressTimer) {
        clearTimeout(gesture.longPressTimer);
        gesture.longPressTimer = null;
      }
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        gesture.startX = evt.nativeEvent.pageX;
        gesture.startY = evt.nativeEvent.pageY;
        gesture.dragging = false;
        gesture.longPressFired = false;
        clearLongPressTimer();
        gesture.longPressTimer = setTimeout(() => {
          gesture.longPressFired = true;
          const roller = rollersRef.current.find((r) => r.id === id);
          if (roller) onLongPressFood?.(roller.food);
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        const dx = pageX - gesture.startX;
        const dy = pageY - gesture.startY;
        if (!gesture.dragging && Math.sqrt(dx * dx + dy * dy) > DRAG_CANCEL_PX) {
          gesture.dragging = true;
          clearLongPressTimer();
        }
      },
      onPanResponderRelease: (evt) => {
        clearLongPressTimer();
        if (gesture.longPressFired) return;
        const dx = evt.nativeEvent.pageX - gesture.startX;
        const roller = rollersRef.current.find((r) => r.id === id);
        if (gesture.dragging && roller?.paused && Math.abs(dx) > TOSS_SWIPE_THRESHOLD) {
          tossRoller(id, dx < 0 ? 'left' : 'right');
          return;
        }
        handleTapRoller(id);
      },
      onPanResponderTerminate: () => {
        clearLongPressTimer();
      },
    });
  };

  // Applies one scrub step (already sign-and-magnitude computed - see
  // stripPan's onPanResponderMove below) to every currently active roller
  // at once, batched into a single state update (consistent with how
  // handleTapRoller's pause branch batches its own multi-roller update).
  // Positive = fast-forward (icons pushed right, toward their normal
  // direction of travel); negative = rewind (pushed left, against it).
  // Anything that crosses an edge exits immediately (feeding history only
  // on the right, per exitRoller's reasoning), and if that leaves room
  // under MAX_CONCURRENT, the next one is pulled in right away - a
  // shuffle-bag pick from the left when moving forward, or the most
  // recently-exited history entry from the right when moving backward -
  // so a sustained fast drag keeps eating through icons continuously
  // rather than stalling until the next PanResponder event.
  const applyScrub = (rawDelta) => {
    if (!rawDelta) return;
    const maxStep = width * MAX_SCRUB_STEP_FACTOR;
    const delta = Math.max(-maxStep, Math.min(maxStep, rawDelta));

    const next = [];
    rollersRef.current.forEach((r) => {
      const newX = r.currentXRef.current + delta;
      if (newX > width + ICON_SIZE || newX < -ICON_SIZE) {
        r.rotateAnim.stop();
        r.translateX.removeListener(r.listenerId);
        r.rotate.removeListener(r.rotateListenerId);
        if (newX > width + ICON_SIZE) {
          historyRef.current = [...historyRef.current, r.food].slice(-HISTORY_LIMIT);
        }
      } else {
        r.translateX.setValue(newX);
        r.currentXRef.current = newX;
        next.push(r);
      }
    });

    if (next.length < MAX_CONCURRENT) {
      if (delta > 0) {
        next.push(buildRoller({ startX: -ICON_SIZE, animate: false }));
      } else if (delta < 0 && historyRef.current.length > 0) {
        const last = historyRef.current[historyRef.current.length - 1];
        historyRef.current = historyRef.current.slice(0, -1);
        next.push(buildRoller({ startX: width + ICON_SIZE, food: last, animate: false }));
      }
    }

    setRollersBoth(next);
  };
  const applyScrubRef = useRef(applyScrub);
  applyScrubRef.current = applyScrub;

  // Restarts normal auto-rolling for every currently active roller from
  // wherever the scrub gesture left it (same proportional-remaining-
  // duration math as handleTapRoller's resume branch), and re-arms the
  // background auto-spawn timer that the gesture paused on grant.
  const resumeAll = () => {
    rollersRef.current.forEach((r) => {
      const remainingDistance = (width + ICON_SIZE) - r.currentXRef.current;
      const totalDistance = width + ICON_SIZE * 2;
      const remainingDuration = Math.max(300, r.tripDuration * (remainingDistance / totalDistance));
      r.rotateAnim.start();
      Animated.timing(r.translateX, {
        toValue: width + ICON_SIZE,
        duration: remainingDuration,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) exitRollerRef.current(r.id);
      });
    });
    scheduleNextSpawnRef.current();
  };
  const resumeAllRef = useRef(resumeAll);
  resumeAllRef.current = resumeAll;

  // Background scrub gesture - lives on the strip container itself, a
  // separate PanResponder from each roller's own (see the component doc
  // comment above for why these two don't fight over touch ownership).
  const scrubGestureRef = useRef({ lastX: 0 });
  const stripPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        scrubGestureRef.current.lastX = evt.nativeEvent.pageX;
        // Pause the background auto-spawn timer and freeze every currently
        // rolling icon exactly where it is, so the gesture has sole control
        // of position until release - same sync-the-JS-side-value fix as
        // handleTapRoller's pause branch, and for the same reason.
        clearTimeout(timeoutRef.current);
        rollersRef.current.forEach((r) => {
          r.translateX.stopAnimation();
          r.translateX.setValue(r.currentXRef.current);
          r.rotate.stopAnimation();
          r.rotate.setValue(r.currentRotateRef.current);
          r.rotateAnim.stop();
        });
      },
      onPanResponderMove: (evt) => {
        const { pageX } = evt.nativeEvent;
        const stepDx = pageX - scrubGestureRef.current.lastX;
        scrubGestureRef.current.lastX = pageX;
        // Quadratic in per-event finger speed, not 1:1 with finger
        // distance (user request) - Math.sign restores the direction
        // squaring erases.
        const scrubDelta = Math.sign(stepDx) * (stepDx * stepDx) * SCRUB_GAIN;
        applyScrubRef.current(scrubDelta);
      },
      onPanResponderRelease: () => resumeAllRef.current(),
      onPanResponderTerminate: () => resumeAllRef.current(),
    })
  ).current;

  const scheduleNextSpawn = () => {
    timeoutRef.current = setTimeout(() => {
      if (rollersRef.current.length < MAX_CONCURRENT) {
        setRollersBoth([...rollersRef.current, buildRoller()]);
      }
      scheduleNextSpawnRef.current();
    }, randomBetween(MIN_SPAWN_DELAY_MS, MAX_SPAWN_DELAY_MS));
  };
  const scheduleNextSpawnRef = useRef(scheduleNextSpawn);
  scheduleNextSpawnRef.current = scheduleNextSpawn;

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      if (rollersRef.current.length < MAX_CONCURRENT) {
        setRollersBoth([...rollersRef.current, buildRoller()]);
      }
      scheduleNextSpawnRef.current();
    }, randomBetween(500, 2000));
    return () => {
      clearTimeout(timeoutRef.current);
      rollersRef.current.forEach((r) => {
        r.rotateAnim.stop();
        r.translateX.removeListener(r.listenerId);
        r.rotate.removeListener(r.rotateListenerId);
      });
    };
  }, [width]);

  return (
    <View
      style={styles.strip}
      // Was box-none (children touchable, container itself not a valid
      // touch target) before the scrub gesture needed the container to
      // catch touches on empty background too - children still get first
      // dibs on their own bounds via normal hit-testing (deepest view
      // under the touch is asked first), so this doesn't change how
      // individual icons' own tap/toss/long-press behave.
      {...stripPan.panHandlers}
      // Without this, Android's view-flattening optimization can drop this
      // plain View from the native tree entirely (it has nothing but layout
      // + elevation:0 to justify its own native backing view), which means
      // the elevation/zIndex set in `strip` below silently never exists as
      // a real layer to lose to topControlsScroll's on some devices/GPU
      // drivers - explains why bumping the elevation number alone (see
      // App.js's topControlsScroll comment) wasn't enough on every Galaxy
      // S20 report even though it worked elsewhere.
      collapsable={false}
    >
      {rollers.map((r) => {
        const spin = r.rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
        const labelOnRight = r.currentXRef.current < width * LEFT_ZONE_FRACTION;
        return (
          <Animated.View
            key={r.id}
            style={[styles.iconTouchable, { transform: [{ translateX: r.translateX }] }]}
          >
            {/* Wide left/right touch area is what actually helps catch a
                moving target (doubled twice per user feedback), but a
                matching vertical reach was extending clean out of this
                strip into the Cuisines trigger row directly above it - taps
                meant for that trigger were landing on the food instead,
                which looked like the trigger had gone unresponsive AND
                randomly paused a roller (user feedback). Keeping
                top/bottom modest avoids bleeding into neighboring rows
                while still giving horizontal room to spare. Plain View, not
                Pressable - `hitSlop` isn't available on a bare View, so the
                enlarged touch area is real geometry (touchArea's negative
                inset) instead; tap/long-press/swipe-toss are all resolved
                by the roller's own PanResponder (see
                createRollerPanResponder above), the same fix already used
                elsewhere in this codebase for the "Pressable vs
                PanResponder fighting over touch ownership" bug class (see
                SlidableSegmented's history). */}
            <View style={styles.touchArea} {...r.panResponder.panHandlers}>
              <Animated.Image
                source={r.food.image}
                resizeMode="contain"
                style={[styles.icon, { transform: [{ rotate: spin }] }]}
              />
            </View>
            {r.paused && (
              // Tapping the revealed name itself also resumes/collapses it -
              // it used to be display-only, so a roller paused near the
              // screen edge (label pushed the "wrong" direction by clamping,
              // or just visually far from the tiny icon) had no way back
              // (user feedback: got stuck with the label up and nothing
              // clickable to dismiss it). Same per-roller PanResponder
              // handles taps/swipes here too.
              <View
                {...r.panResponder.panHandlers}
                style={[styles.label, labelOnRight ? styles.labelRight : styles.labelLeft]}
              >
                <Text style={styles.labelText} numberOfLines={1}>{r.food.name}</Text>
              </View>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // Height keeps the same 10px margin around the icon that the original
  // 34px icon had (44 - 34 = 10), just scaled up with ICON_SIZE, so the
  // doubled icon isn't clipped and stays vertically centered in this row
  // exactly like before (`justifyContent: 'center'`) - this row sits as its
  // own flex item directly between FilterPanel's Cuisines trigger and the
  // game-mode selector, with nothing else adding space between them, so
  // "centered in the gap" falls out of it just being the one thing in that
  // gap rather than needing separate centering logic.
  // zIndex/elevation explicitly 0 (not just left unset) - on some Android
  // GPU drivers, a view left with no elevation at all behaves differently
  // for z-ordering purposes than one explicitly pinned to 0, specifically
  // once its native-driven animated children get promoted onto their own
  // compositing layer (see App.js's topControlsScroll comment for the fuller
  // story - a Galaxy S20 report of this strip fully hiding the Cuisines
  // trigger despite that sibling having a real elevation edge on paper).
  strip: { width: '100%', height: ICON_SIZE + 10, overflow: 'visible', justifyContent: 'center', zIndex: 0, elevation: 0 },
  iconTouchable: { position: 'absolute', width: ICON_SIZE, height: ICON_SIZE },
  // Enlarges the touchable footprint via real geometry (negative insets
  // push this box's edges outside its ICON_SIZE x ICON_SIZE parent) rather
  // than `hitSlop`, which only exists on Pressable - a bare View (needed
  // here for PanResponder) doesn't have it. Centers the icon within the
  // bigger box so it still renders in exactly the same visual spot as before.
  // left/right pulled way back in (was -75, a 220px-wide hit zone on a 70px
  // icon) now that the strip's background carries its own scrub gesture
  // (see stripPan above) - that big a reach was swallowing most of the
  // "blank space" next to a moving icon that the scrub gesture needs to
  // work at all (user report: tapping next to an icon kept hitting it
  // instead of scrubbing). -30 still meaningfully widens the target over
  // the bare 70px icon without eating the whole gap between icons.
  touchArea: {
    position: 'absolute', top: -15, bottom: -15, left: -30, right: -30,
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { width: ICON_SIZE, height: ICON_SIZE },
  label: {
    // Explicit width, not maxWidth - an absolutely-positioned view with only
    // one inset (left or right) and no fixed width can get measured at ~0 on
    // Android before its Text child's real content is known, which froze
    // numberOfLines=1's ellipsis at just "..." instead of the real name
    // (user feedback).
    position: 'absolute', top: (ICON_SIZE - 24) / 2, backgroundColor: colors.card,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, width: 140,
    ...buttonDepth, elevation: 12,
  },
  labelRight: { left: ICON_SIZE + 6 },
  labelLeft: { right: ICON_SIZE + 6 },
  labelText: { color: colors.textLight, fontSize: 12, fontWeight: '700' },
});
