import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, Pressable, PanResponder, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../ThemeContext';
import { createFoodPicker, foodsForCuisines } from '../foods';
import { hexToHsl, hslToHex } from '../utils/color';

// The notional full spin-down curve, in ms - see CONTACT_PCT below for why
// the coin doesn't actually ride this curve all the way to its end. Total
// animation length (CONTACT_MS + BOUNCE_MS + PRECESSION_MS + FALL_MS) must
// stay in sync with COIN_ANIMATION_MS in constants.js - App.js waits that
// long before revealing the result, so a fast API response can never cut
// the animation short.
const SPIN_MS = 1500;

// What fraction of the SPIN_MS curve plays out before the coin actually
// touches the table. A curve like this one (Easing.out(quart), see below)
// decelerates to a dead stop AT ITS OWN END by definition - riding it all
// the way out before triggering contact meant the coin had already nearly
// stopped spinning by the time it "landed" (user feedback: wanted it still
// visibly flipping when it hits). Cutting in at CONTACT_PCT instead reads
// the curve's rotation/velocity from partway through, where it's still
// moving, rather than off the flattened tail.
const CONTACT_PCT = 70;
const CONTACT_MS = (SPIN_MS * CONTACT_PCT) / 100;

const quartOut = (t) => 1 - Math.pow(1 - t, 4);
// The rotation value the curve has reached at the moment of contact -
// necessarily less than the full 1260deg, since contact happens before the
// curve's natural end.
const ROTATION_AT_CONTACT = quartOut(CONTACT_PCT / 100) * 1260;
// Animated.timing's easing runs over ITS OWN duration (CONTACT_MS here),
// normalized to [0,1] - it doesn't know about the wider SPIN_MS curve it's
// a slice of. This rescales so easing(1) lands exactly on
// ROTATION_AT_CONTACT/1260 (matching toValue below) while the SHAPE traced
// getting there is the true 0..CONTACT_PCT segment of the real curve, not a
// version stretched to fill the whole duration - i.e. contact still finds
// the coin moving at whatever speed the real curve has at that point.
const contactEasing = (t) => quartOut(t * (CONTACT_PCT / 100)) / quartOut(CONTACT_PCT / 100);

// Minimum release speed (magnitude of PanResponder's vx/vy, roughly
// px/ms) for a "flick" to count as a spin request in flick mode - low
// enough to feel responsive, high enough that an accidental drag/tap
// doesn't fire it.
const FLICK_VELOCITY_THRESHOLD = 0.5;

// The coin is a real two-sided object: a "front" and "back" face, each
// showing one food icon, composited with `perspective` + `rotateX` +
// `backfaceVisibility: hidden` (the standard 3D flip-card technique) so
// only one face is ever showing at a time, exactly like a spinning coin.
// Each face is visible for a 180deg window, centered on its own rotation
// (front around 0/360/720..., back around 180/540/900...), so the two
// faces swap visibility every 180deg starting at the 90deg mark: 90, 270,
// 450, 630, 810, 990, 1170 are the only crossings between 0 and 1260deg.
// A food icon should look fresh every time its face turns back into view,
// not still showing whatever was there half a turn ago - so each crossing
// re-randomizes the food on the face that's ABOUT to appear.
//
// These times are solved analytically from the rotation easing curve below
// (a single Easing.out(quart) over the whole 0->1260deg spin), inverting
// rotation(t) = 1260 * (1 - (1-t)^4) with t = elapsed/SPIN_MS, to find the
// exact moment it crosses each of those 7 angles - not measured/
// approximated. CONTACT_PCT truncates when rotation.timing STOPS (see
// contactEasing above), not the elapsed-to-degree relationship along the
// way, so these are still evaluated against the plain SPIN_MS curve.
// Recomputed whenever SPIN_MS or the easing curve changes.
const FLIP_CROSSINGS_MS = [28, 88, 157, 239, 340, 479, 725];

// How far up the coin rises during the toss, and back down. Tuned to reach
// roughly up to the Cuisines section header - the last item in the filter
// list sitting just above the mode toggle/coin column (user request: "go as
// high as cuisine"). This is a tuned estimate for a typical phone screen,
// not a live measurement of the actual Cuisines header position - dial it
// up/down if it over/undershoots on-device.
const LIFT_DISTANCE = 210;

// How much the coin shrinks at the peak of its toss, mimicking it flying
// further from the "camera" the higher it goes - back to full size by the
// time it lands.
const APEX_SCALE = 0.75;

// Landing sequence, in order - tuned against a live browser prototype (a
// bench replicating these exact curves) rather than guessed and rebuilt on
// -device repeatedly, since earlier attempts at a scale-squish bounce +
// side-to-side wobble kept missing what a dropped coin actually does.
//
// 1. BOUNCE: the instant the coin touches the table (rotation.timing above
//    completing), a small vertical hop back up (BOUNCE_HEIGHT/BOUNCE_MS on
//    `lift`) while ALSO completing one more half-rotation in the air (the
//    second `rotation.timing` step) - not a scale squish, an actual hop.
// 2. ROLL: once the hop lands, the coin leans onto its edge (LEAN_DEG) and
//    that lean sweeps around in a circle (PRECESSION_SWEEP_DEG over
//    PRECESSION_MS) - like a dropped coin rattling/precessing before it
//    settles, not rocking side-to-side in place. Built from two composed
//    rotations on the same container: rotateZ (which direction the lean
//    currently points) then rotateX (how far it's leaned) - sweeping the
//    rotateZ value is what makes the lean's direction orbit in a circle.
// 3. FALL FLAT: the lean drops back to 0 over FALL_MS and the coin is at
//    rest - App.js reveals the result immediately after (no added pause).
const BOUNCE_HEIGHT = 60;
const BOUNCE_MS = 500;
const LEAN_DEG = 19;
const PRECESSION_SWEEP_DEG = 30;
const PRECESSION_MS = 400;
const FALL_MS = 100;
// The lean ramps up to LEAN_DEG quickly at the start of the roll (rather
// than snapping instantly), then holds there for the rest of the sweep -
// this is that ramp's share of PRECESSION_MS.
const LEAN_RAMP_MS = Math.round(PRECESSION_MS * 0.18);

const TOTAL_ANIMATION_MS = CONTACT_MS + BOUNCE_MS + PRECESSION_MS + FALL_MS;

/**
 * The "NOM | NOM" / food coin. Uses React Native's built-in Animated API
 * (not react-native-reanimated) - Reanimated 4 needs native code Expo Go
 * doesn't ship with, so it can't run here; Animated's perspective/rotateX/
 * backfaceVisibility support (this is a normal transform, no special
 * native module) is enough for a real two-sided 3D flip. Flips end-over-end
 * around its horizontal axis (rotateX), not side-to-side around a vertical
 * one (user feedback: wanted it to flip "like a real coin toss").
 *
 * `interaction` ('tap' | 'flick', from Settings > Preferences) switches
 * between a plain Pressable and a PanResponder-based flick gesture - also
 * built into core React Native, no new native dependency either.
 */
const CoinSpinner = forwardRef(function CoinSpinner({ isSearching, onPress, interaction = 'tap', hapticsEnabled = true, disabled = false, selectedCuisines = [] }, ref) {
  const { colors } = useTheme();
  // A flat solid-color circle reads as a sticker, not an object with volume.
  // Deriving a lighter tint of the same accent hue (same trick ThemeContext
  // uses to derive accentDark/accentDeep from one picked color) and running
  // it into accentDeep as a diagonal gradient - light "catching the top"
  // fading to dark "curving away" - is the cheap, no-new-dependency way to
  // fake curvature on a 2D disc (expo-linear-gradient is already a
  // dependency, works fine in Expo Go, no reanimated/3D-lib needed).
  const { h, s, l } = hexToHsl(colors.accent);
  const faceHighlight = hslToHex(h, s, Math.min(96, l + 24));
  const styles = makeStyles(colors);
  const rotation = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  // Direction the lean currently points (rotateZ, sweeps through the roll).
  const precession = useRef(new Animated.Value(0)).current;
  // How far the coin is currently leaned onto its edge (rotateX, 0..LEAN_DEG).
  const lean = useRef(new Animated.Value(0)).current;
  const flipTimeoutsRef = useRef([]);
  // Own shuffle-bag picker (see createFoodPicker in foods.js) so the coin's
  // sequence of faces cycles through every food once before repeating,
  // independently from the raccoon's and rolling strip's own sequences.
  // Rebuilt fresh at the start of every spin (see spin() below) against
  // whatever cuisine filter is active then, rather than fixed once here at
  // mount - the filter can change between spins.
  const pickFoodRef = useRef(createFoodPicker());
  // Reassigned every render (same pattern as interactionRef/disabledRef
  // below) so spin() - called from a PanResponder/imperative-handle callback
  // that closed over an old render - always reads the CURRENT filter.
  const selectedCuisinesRef = useRef(selectedCuisines);
  selectedCuisinesRef.current = selectedCuisines;

  const [frontFood, setFrontFood] = useState(() => pickFoodRef.current());
  const [backFood, setBackFood] = useState(() => pickFoodRef.current());

  // PanResponder's handlers are created once (via the outer useRef) but need
  // the LATEST interaction/isSearching/disabled/hapticsEnabled on every
  // release, so read those off refs kept in sync every render rather than
  // closing over the values from whichever render first built the responder.
  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;
  // `disabled` (e.g. GPS not locked yet) blocks a spin exactly like
  // isSearching does - without this, a flick fired before location resolves
  // would call onPress and hit App.js's "still locking onto your GPS
  // coordinate" alert, which felt like a flick-specific bug but wasn't.
  const disabledRef = useRef(isSearching || disabled);
  disabledRef.current = isSearching || disabled;
  const hapticsRef = useRef(hapticsEnabled);
  hapticsRef.current = hapticsEnabled;

  useImperativeHandle(ref, () => ({
    spin() {
      // Rebuilt against whatever cuisine filter is active for THIS spin,
      // not fixed once at mount - filters can change between spins. When a
      // filter is active every face shown this spin, including whichever
      // one is showing when it lands, is drawn only from matching dishes
      // (user request: the coin previously picked from all 170 icons
      // regardless of filter, so it could land on a dish from a totally
      // different cuisine than what's selected).
      pickFoodRef.current = createFoodPicker(foodsForCuisines(selectedCuisinesRef.current));

      // Fresh random content on both faces at the start of every spin -
      // front is visible immediately, back will be the first one revealed
      // at the first crossing below.
      setFrontFood(pickFoodRef.current());
      setBackFood(pickFoodRef.current());

      flipTimeoutsRef.current.forEach(clearTimeout);
      flipTimeoutsRef.current = FLIP_CROSSINGS_MS.map((ms, i) =>
        setTimeout(() => {
          if (i % 2 === 0) setBackFood(pickFoodRef.current());
          else setFrontFood(pickFoodRef.current());
        }, ms)
      );

      // stopAnimation()'s callback is async - it can fire AFTER a
      // newly-`.start()`ed animation on the same value is already running,
      // and calling setValue() on a value stops whatever animation is
      // currently driving it. Previously the reset (setValue) and the new
      // spin's `.start()` were issued back-to-back, racing each other: if
      // the stop callback landed late, its setValue(0) would cancel the
      // spin that had just begun, freezing the coin mid-flip (user report:
      // "sometimes won't complete the flip"). Nesting each value's new
      // animation INSIDE its own stopAnimation callback guarantees the
      // reset always lands before the new animation starts, for all five
      // values independently.
      rotation.stopAnimation(() => {
        rotation.setValue(0);
        Animated.sequence([
          // Ease-out quartic, cut short at CONTACT_MS - see contactEasing
          // above for why this isn't just a shorter version of the same
          // curve stretched to fill CONTACT_MS (that would still decelerate
          // to a stop AT its own end, same problem as before).
          Animated.timing(rotation, {
            toValue: ROTATION_AT_CONTACT,
            duration: CONTACT_MS,
            easing: contactEasing,
            useNativeDriver: true,
          }),
          // The bounce's extra half-flip, continuing from whatever speed/
          // position the coin was at on contact.
          Animated.timing(rotation, {
            toValue: ROTATION_AT_CONTACT + 180,
            duration: BOUNCE_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      });

      lift.stopAnimation(() => {
        lift.setValue(0);
        Animated.sequence([
          // The toss: up during the first half of CONTACT_MS, back down for
          // the second half.
          Animated.timing(lift, {
            toValue: -LIFT_DISTANCE,
            duration: CONTACT_MS / 2,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(lift, {
            toValue: 0,
            duration: CONTACT_MS / 2,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          // The bounce: a small hop back up and down, in lockstep with
          // rotation's extra half-flip above.
          Animated.timing(lift, {
            toValue: -BOUNCE_HEIGHT,
            duration: BOUNCE_MS / 2,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(lift, {
            toValue: 0,
            duration: BOUNCE_MS / 2,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      });

      scale.stopAnimation(() => {
        scale.setValue(1);
        // Shrinks to APEX_SCALE in lockstep with the rise and grows back on
        // the way down - the coin visually gets smaller the higher it goes,
        // like it's flying further from the camera. Nothing further happens
        // to scale after this - the old landing squish-bounce is gone,
        // replaced by the hop on `lift` above.
        Animated.sequence([
          Animated.timing(scale, {
            toValue: APEX_SCALE,
            duration: CONTACT_MS / 2,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: CONTACT_MS / 2,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      });

      precession.stopAnimation(() => {
        precession.setValue(0);
        // Starts right as the bounce lands, sweeps through the whole roll,
        // then simply stops - it doesn't need to unwind, it just holds
        // wherever it ended up (a real dropped coin doesn't return to its
        // starting heading either).
        Animated.sequence([
          Animated.delay(CONTACT_MS + BOUNCE_MS),
          Animated.timing(precession, {
            toValue: PRECESSION_SWEEP_DEG,
            duration: PRECESSION_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      });

      lean.stopAnimation(() => {
        lean.setValue(0);
        // Ramps up to LEAN_DEG right as the bounce lands (same moment
        // precession starts sweeping), holds through the rest of the roll,
        // then drops back to 0 (falls flat) over FALL_MS.
        Animated.sequence([
          Animated.delay(CONTACT_MS + BOUNCE_MS),
          Animated.timing(lean, {
            toValue: LEAN_DEG,
            duration: LEAN_RAMP_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(PRECESSION_MS - LEAN_RAMP_MS),
          Animated.timing(lean, {
            toValue: 0,
            duration: FALL_MS,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start();
      });

      if (hapticsRef.current) {
        setTimeout(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }, TOTAL_ANIMATION_MS);
      }
    },
    reset() {
      flipTimeoutsRef.current.forEach(clearTimeout);
      rotation.setValue(0);
      scale.setValue(1);
      lift.setValue(0);
      precession.setValue(0);
      lean.setValue(0);
    },
  }));

  // Each face gets its OWN fully-resolved rotateX, rather than one rotateX
  // on the shared parent plus a static 180deg counter-transform on faceBack
  // alone (how this used to be split). That older split relied on Android
  // correctly composing a child's local transform with its parent's
  // separately-animated one purely to decide backfaceVisibility culling -
  // which is a known-unreliable combination on Android specifically, and is
  // what was actually causing "food lands upside down" (user report,
  // persisted after the earlier setValue-race fixes because this was a
  // different, rendering-level cause, not a timing one). Giving each face
  // its own complete rotation - front = rotation, back = rotation+180 - means
  // there's no parent/child split left for Android to get wrong: each face's
  // local transform already IS its true final orientation. Range covers the
  // full reachable span (rotation stops changing at ROTATION_AT_CONTACT+180,
  // once the bounce's extra half-flip completes).
  const ROTATION_MAX = ROTATION_AT_CONTACT + 180;
  const rotateXFront = rotation.interpolate({
    inputRange: [0, ROTATION_MAX],
    outputRange: ['0deg', `${ROTATION_MAX}deg`],
  });
  const rotateXBack = rotation.interpolate({
    inputRange: [0, ROTATION_MAX],
    outputRange: ['180deg', `${ROTATION_MAX + 180}deg`],
  });
  // In-plane spin (rotateZ) representing which direction the coin's lean
  // currently points, and the lean itself (rotateX) - composed in that
  // order on the container below so sweeping `precession` traces the lean's
  // direction around in a circle, per the ROLL step described above
  // BOUNCE_HEIGHT. Both are plain identity mappings, just attaching the
  // 'deg' unit.
  const precessionRotate = precession.interpolate({
    inputRange: [0, PRECESSION_SWEEP_DEG],
    outputRange: ['0deg', `${PRECESSION_SWEEP_DEG}deg`],
  });
  const leanRotate = lean.interpolate({
    inputRange: [0, LEAN_DEG],
    outputRange: ['0deg', `${LEAN_DEG}deg`],
  });

  // A ground shadow that's static regardless of toss height is the other
  // big missing depth cue alongside the flat face color: nothing on screen
  // currently tells you the coin is flying UP away from the table versus
  // just changing size in place. Tying a shadow's scale/opacity to the same
  // `lift` value already driving the toss - small and faint at the peak,
  // full-size and darkest once it's back down at lift=0 - is what actually
  // sells "this object has left the ground plane and is coming back to it."
  // The same interpolation also naturally covers the smaller bounce hop
  // (lift dips to -BOUNCE_HEIGHT, well within this range), giving the
  // shadow a subtler echo of the same effect there. This is a separate
  // element from the coin itself (not inside `coin`'s transformed
  // container), so it never rises, spins, or scales WITH the coin - it
  // only reacts to the same lift value.
  //
  // Opacity pushed higher than a "correct" shadow would need (0.4 max used
  // to be plenty against the light plate that sat behind it) now that the
  // plate is gone (user request) - it's sitting directly on the app's own
  // near-black background (colors.background, #1E1E1E) instead, where a
  // dark-on-dark shadow needs real contrast to read as visible at all.
  const shadowOpacity = lift.interpolate({
    inputRange: [-LIFT_DISTANCE, 0],
    outputRange: [0.18, 0.62],
    extrapolate: 'clamp',
  });
  const shadowScale = lift.interpolate({
    inputRange: [-LIFT_DISTANCE, 0],
    outputRange: [0.4, 1],
    extrapolate: 'clamp',
  });

  const handlePress = () => {
    if (hapticsRef.current) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  // PanResponder.create() only ever runs once (useRef freezes it after the
  // first render), so its callbacks can't just call `handlePress` directly -
  // that would permanently close over the very first render's `onPress`
  // (App.js's startRandomizer as it existed before GPS ever resolved,
  // forever seeing location as null). Routing through a ref that's
  // reassigned every render, like disabledRef/hapticsRef above, means the
  // frozen callback always reaches the CURRENT handlePress instead.
  const handlePressRef = useRef(handlePress);
  handlePressRef.current = handlePress;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => interactionRef.current === 'flick' && !disabledRef.current,
      onMoveShouldSetPanResponder: () => interactionRef.current === 'flick' && !disabledRef.current,
      onPanResponderRelease: (_evt, gestureState) => {
        if (disabledRef.current) return;
        const speed = Math.sqrt(gestureState.vx ** 2 + gestureState.vy ** 2);
        if (speed > FLICK_VELOCITY_THRESHOLD) handlePressRef.current();
      },
    })
  ).current;

  const coin = (
    <Animated.View
      style={[
        styles.flipContainer,
        {
          transform: [
            { perspective: 800 },
            { translateY: lift },
            { scale },
            { rotateZ: precessionRotate },
            { rotateX: leanRotate },
          ],
        },
      ]}
    >
      {/* Food images deliberately pulled out of render for now (user
          request) so the coin's own shape/shading/motion can be judged on
          its own, without icon content distracting from it. frontFood/
          backFood state and the pick/randomize-on-crossing logic above are
          untouched - this is just a render-layer cut, trivial to restore by
          putting the two <Image> elements (source={frontFood.image} /
          backFood.image, style={styles.foodIcon}) back as children of the
          faces below. */}
      {isSearching ? (
        <>
          <Animated.View style={[styles.face, { transform: [{ rotateX: rotateXFront }] }]}>
            <LinearGradient
              colors={[faceHighlight, colors.accent, colors.accentDeep]}
              start={{ x: 0.15, y: 0.1 }}
              end={{ x: 0.85, y: 0.95 }}
              style={styles.faceGradient}
            />
          </Animated.View>
          <Animated.View style={[styles.face, { transform: [{ rotateX: rotateXBack }] }]}>
            <LinearGradient
              colors={[faceHighlight, colors.accent, colors.accentDeep]}
              start={{ x: 0.15, y: 0.1 }}
              end={{ x: 0.85, y: 0.95 }}
              style={styles.faceGradient}
            />
          </Animated.View>
        </>
      ) : (
        <Animated.View style={styles.face}>
          <LinearGradient
            colors={[faceHighlight, colors.accent, colors.accentDeep]}
            start={{ x: 0.15, y: 0.1 }}
            end={{ x: 0.85, y: 0.95 }}
            style={styles.faceGradient}
          />
          <Text style={styles.buttonText}>NOM | NOM</Text>
        </Animated.View>
      )}
    </Animated.View>
  );

  // Sits below `coin` in paint order (and outside its transformed
  // container) so it stays a flat, static ellipse on the "ground" while the
  // coin flies/spins above it - see shadowOpacity/shadowScale above for why.
  const groundShadow = (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.groundShadow,
        { opacity: shadowOpacity, transform: [{ scale: shadowScale }] },
      ]}
    />
  );

  // Elevation is now constant (always applied), never toggled with
  // isSearching. It used to switch 0 -> 20 only while spinning, but this app
  // already has a confirmed case of the same Android bug elsewhere (see
  // App.js's modeBtn comment: "Android silently makes a view vanish after
  // its `elevation` value changes between renders") - changing the value
  // between renders, not just having a low one, is what's unreliable. That
  // matches the user report of the coin "sometimes" going behind neighboring
  // items: it depended on which render the elevation prop change happened to
  // land on relative to the native thread's already-running toss animation.
  // Sitting a fixed step above its neighbors (mode toggle: 10, rolling food
  // strip's promoted layer, topControlsScroll: 5) at rest is harmless, so
  // there's no real downside to leaving it always on.
  const wrapperStyle = styles.wrapper;

  return interaction === 'flick' ? (
    <Animated.View style={wrapperStyle} {...panResponder.panHandlers}>
      {groundShadow}
      {coin}
    </Animated.View>
  ) : (
    <Pressable style={wrapperStyle} onPress={handlePress} disabled={isSearching || disabled}>
      {groundShadow}
      {coin}
    </Pressable>
  );
});

export default CoinSpinner;

const makeStyles = (colors) => StyleSheet.create({
  // Elevated above the mode toggle sitting right above it in the same
  // column, so the coin visibly floats in front of it (and everything
  // else on the home screen) at all times, including mid-toss. Constant,
  // not conditional on isSearching - see the comment where this is used.
  wrapper: { zIndex: 20, elevation: 20 },
  flipContainer: { width: 160, height: 160 },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: colors.accentDark,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    backfaceVisibility: 'hidden',
  },
  // Sits inside the face's border ring (inset by borderWidth on all sides)
  // with its own borderRadius+overflow:hidden, since a child component
  // (LinearGradient) isn't automatically clipped to its parent's rounded
  // corners the way a View's own backgroundColor is - without this the
  // gradient would render as a square peeking past the circular border.
  faceGradient: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 74,
    overflow: 'hidden',
  },
  foodIcon: { width: 92, height: 98 },
  buttonText: { fontWeight: '900', fontSize: 20, color: colors.textDark, letterSpacing: 1 },
  // Positioned under the coin's resting footprint (flipContainer is 160x160)
  // rather than centered via flex, since it's an absolutely-positioned
  // sibling of the coin and needs to land at a fixed spot regardless of
  // whichever interaction-mode wrapper (Pressable/PanResponder View) it's
  // rendered inside.
  groundShadow: {
    position: 'absolute',
    top: 150,
    left: 25,
    width: 110,
    height: 24,
    borderRadius: 55,
    backgroundColor: '#000',
  },
});
