import React, { useRef, useState } from 'react';
import { View, Animated, TextInput, PanResponder, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../ThemeContext';
import { buttonDepth, neonSelected, accentGradient } from '../constants';

// No elevation anywhere in this file's styles, on purpose - this button
// lives nested inside CuisineDropdown's clipped card, and elevation on a
// plain View nested that deep was confirmed (by a live on-device test) to
// break the card's rounded-corner clipping. See the root-cause note at the
// top of CuisineDropdown.js.

const SLOT_COUNT = 3;
// How far (px) a drag has to travel before it rolls to the next/previous
// slot - small enough to feel responsive, large enough that it reads as a
// deliberate swipe rather than a jittery tap.
const STEP_PX = 40;
const LONG_PRESS_MS = 500;
// Movement past this cancels the long-press timer and commits to treating
// the gesture as a drag instead of a hold.
const DRAG_CANCEL_PX = 10;

// The decorative pivot (see the comment where it renders) is a solid line
// segment centered vertically, flanked on each side by this many dots -
// fading from "practically part of the line" to faint/tiny/far-apart at the
// tips (user request: "gradient of dots turning into a line then turning
// back into a gradient of dots").
const PIVOT_DOTS_PER_SIDE = 3;
// Fraction of the pivot's total measured height that stays a solid line,
// centered - the rest is split between the dot gradients on each side.
const PIVOT_LINE_FRACTION = 0.3;
const PIVOT_MAX_DOT_SIZE = 3;
const PIVOT_MIN_DOT_SIZE = 1;
const PIVOT_MAX_OPACITY = 0.6; // matches the old solid line's opacity
const PIVOT_MIN_OPACITY = 0.12;

// Order-independent - same set of cuisines regardless of which order they
// were toggled in.
function sameCuisines(a, b) {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((c) => bSet.has(c));
}

/**
 * One button that cycles through 3 saved cuisine presets. Swiping up/down
 * rolls the label to the next/previous slot - the button itself never moves
 * or resizes, only the text does - vertical rather than horizontal (user
 * request: this sits close to the screen edge, where a vertical swipe feels
 * more natural), rolling around a decorative pivot on the right edge - a
 * line fading into a gradient of dots on each side - that suggests the
 * roll's axis. Capped to
 * exactly one slot per gesture, no matter how far or fast you drag - it
 * used to keep cycling for every STEP_PX crossed in one continuous drag,
 * which felt like it could run away from you (user feedback).
 *
 * A plain tap loads whichever slot is currently showing into the cuisine
 * selection. A long-press either saves the current selection into the slot
 * (with a flash + success haptic), or - if the slot ALREADY holds exactly
 * the current selection, so a save would be a no-op - opens a rename field
 * instead (user request: reuse that otherwise-wasted gesture to let a slot
 * be renamed).
 *
 * Built as a single PanResponder rather than a Pressable+PanResponder combo -
 * this codebase has a standing bug class where the two fight over touch
 * ownership (see SlidableSegmented's history with that exact problem) - so
 * taps/holds/drags are all resolved by hand from one responder here instead.
 */
export default function FaveCuisineButton({ slots, onLoad, onSave, onRename, selectedCuisines }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const slideY = useRef(new Animated.Value(0)).current;
  const [flash, setFlash] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');
  // Measured (not assumed) - same reasoning as the drag sliders elsewhere in
  // this app: pixel-exact positioning for the pivot's dots needs the real
  // rendered height of their container, not a guessed constant.
  const [pivotHeight, setPivotHeight] = useState(0);

  // Reassigned every render so the frozen PanResponder callbacks (see
  // useRef below) always see the CURRENT props, not whichever instance
  // existed on first mount.
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onRenameRef = useRef(onRename);
  onRenameRef.current = onRename;
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const selectedCuisinesRef = useRef(selectedCuisines);
  selectedCuisinesRef.current = selectedCuisines;

  const gestureRef = useRef({ startY: 0, baseY: 0, dragging: false, stepTaken: false, longPressTimer: null, longPressFired: false });

  const clearLongPressTimer = () => {
    if (gestureRef.current.longPressTimer) {
      clearTimeout(gestureRef.current.longPressTimer);
      gestureRef.current.longPressTimer = null;
    }
  };

  const triggerLongPress = () => {
    const idx = activeIndexRef.current;
    const slot = slotsRef.current[idx] || { name: `Fave ${idx + 1}`, cuisines: [] };
    const current = selectedCuisinesRef.current || [];
    if (sameCuisines(current, slot.cuisines || [])) {
      // Saving would be a no-op (nothing's changed) - repurpose the
      // long-press to rename this slot instead.
      setRenameText(slot.name);
      setRenaming(true);
      Haptics.selectionAsync();
      return;
    }
    onSaveRef.current(idx);
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };
  const triggerLongPressRef = useRef(triggerLongPress);
  triggerLongPressRef.current = triggerLongPress;

  const commitRename = () => {
    const trimmed = renameText.trim();
    if (trimmed) onRenameRef.current(activeIndexRef.current, trimmed);
    setRenaming(false);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const g = gestureRef.current;
        g.startY = evt.nativeEvent.pageY;
        g.baseY = evt.nativeEvent.pageY;
        g.dragging = false;
        g.stepTaken = false;
        g.longPressFired = false;
        clearLongPressTimer();
        g.longPressTimer = setTimeout(() => {
          g.longPressFired = true;
          triggerLongPressRef.current();
        }, LONG_PRESS_MS);
      },
      onPanResponderMove: (evt) => {
        const g = gestureRef.current;
        const { pageY } = evt.nativeEvent;
        if (!g.dragging && Math.abs(pageY - g.startY) > DRAG_CANCEL_PX) {
          g.dragging = true;
          clearLongPressTimer();
        }
        // Once this gesture has already rolled one slot, ignore the rest of
        // the drag entirely - no matter how far you keep dragging, it only
        // ever moves to the next/previous slot, once, per touch (user
        // request).
        if (!g.dragging || g.stepTaken) return;
        const dy = pageY - g.baseY;
        if (dy <= -STEP_PX) {
          g.stepTaken = true;
          const next = (activeIndexRef.current + 1) % SLOT_COUNT;
          activeIndexRef.current = next;
          setActiveIndex(next);
          slideY.setValue(0);
        } else if (dy >= STEP_PX) {
          g.stepTaken = true;
          const next = (activeIndexRef.current + SLOT_COUNT - 1) % SLOT_COUNT;
          activeIndexRef.current = next;
          setActiveIndex(next);
          slideY.setValue(0);
        } else {
          slideY.setValue(dy);
        }
      },
      onPanResponderRelease: () => {
        const g = gestureRef.current;
        clearLongPressTimer();
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
        if (g.dragging || g.longPressFired) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onLoadRef.current(activeIndexRef.current);
      },
      onPanResponderTerminate: () => {
        clearLongPressTimer();
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const activeSlot = slots[activeIndex] || { name: `Fave ${activeIndex + 1}`, cuisines: [] };
  const hasContent = (activeSlot.cuisines || []).length > 0;

  // Dots on each side of the center line, spaced and sized by a quadratic
  // falloff from the line's edge (user request: "quadratic distribution...
  // very dense to very light gradually then rapidly"). t goes 0 (right at
  // the line) to 1 (the tip); using t*t for both the distance-from-line AND
  // the size/opacity interpolation means each successive dot is packed
  // tighter and barely fading near the line (small t*t deltas), then spreads
  // out and fades increasingly fast approaching the tip (t*t grows faster
  // as t grows) - dense-then-gradual-then-rapid in one curve.
  const pivotLineHalf = (pivotHeight * PIVOT_LINE_FRACTION) / 2;
  const pivotDotSpan = Math.max(0, pivotHeight / 2 - pivotLineHalf);
  const pivotDots = Array.from({ length: PIVOT_DOTS_PER_SIDE }, (_, i) => {
    const t = (i + 1) / PIVOT_DOTS_PER_SIDE;
    const q = t * t;
    return {
      distance: pivotLineHalf + q * pivotDotSpan,
      size: PIVOT_MAX_DOT_SIZE - q * (PIVOT_MAX_DOT_SIZE - PIVOT_MIN_DOT_SIZE),
      opacity: PIVOT_MAX_OPACITY - q * (PIVOT_MAX_OPACITY - PIVOT_MIN_OPACITY),
    };
  });

  if (renaming) {
    return (
      <View style={styles.renameBox}>
        <TextInput
          style={styles.renameInput}
          value={renameText}
          onChangeText={setRenameText}
          autoFocus
          maxLength={14}
          onSubmitEditing={commitRename}
          onBlur={commitRename}
          selectTextOnFocus
        />
      </View>
    );
  }

  return (
    <View style={[styles.button, flash && styles.buttonFlash]} {...pan.panHandlers}>
      {/* Same glossy diagonal gradient as the coin (accentGradient in
          constants.js) - user request, after liking it there. */}
      {flash && <LinearGradient {...accentGradient(colors)} style={StyleSheet.absoluteFill} />}
      <Animated.Text
        style={[styles.text, flash && styles.textFlash, { transform: [{ translateY: slideY }] }]}
        numberOfLines={1}
      >
        {activeSlot.name}
      </Animated.Text>
      {/* A dot instead of dimming the label itself - dimming an already-
          muted #AAA text down to 0.5 opacity against the button's dark
          background was faint enough to read as the lettering having
          vanished entirely (user feedback), especially right after
          swiping past a slot that just happens to be unsaved. */}
      {!hasContent && <View style={styles.emptyDot} />}
      {/* Decorative pivot on the right edge - purely visual, so the vertical
          roll reads as rotating around this side rather than just sliding
          (user request). A solid line segment centered vertically, fading
          out into a symmetric gradient of dots on each side (user request -
          see the pivotDots computation above for the quadratic spacing/
          size/opacity curve). */}
      <View
        style={styles.pivotWrap}
        onLayout={(e) => setPivotHeight(e.nativeEvent.layout.height)}
      >
        <View style={[styles.pivotLine, { height: pivotHeight * PIVOT_LINE_FRACTION, top: pivotHeight / 2 - pivotLineHalf }]} />
        {pivotDots.map(({ distance, size, opacity }, i) => (
          <React.Fragment key={i}>
            <View
              style={[
                styles.pivotDot,
                { width: size, height: size, borderRadius: size / 2, opacity, top: pivotHeight / 2 - distance - size / 2 },
              ]}
            />
            <View
              style={[
                styles.pivotDot,
                { width: size, height: size, borderRadius: size / 2, opacity, top: pivotHeight / 2 + distance - size / 2 },
              ]}
            />
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // borderWidth pinned at 2 (transparent at rest) rather than only
  // appearing during the flash - same fix as App.js's modeBtn/FilterPanel's
  // toggleBtn: a sudden 0->2px border can nudge/squeeze fixed-width content.
  // Extra right padding clears room for the decorative pivot line/arrows.
  // colors.card (not cardAlt) - matches the All/None/search row it shares
  // (see CuisineDropdown's topRow) so the whole control strip reads as one
  // distinct group, set apart from the cuisine bubbles below it.
  button: {
    width: 92, paddingVertical: 10, paddingRight: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, overflow: 'hidden', ...buttonDepth, elevation: 0,
    borderWidth: 2, borderColor: 'transparent',
  },
  buttonFlash: {
    backgroundColor: colors.accent, ...neonSelected(colors),
    elevation: 0,
  },
  text: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  // The flash swaps the button's background to the bright accent color -
  // every other accent-background state in this app (cuisine bubbles, mode
  // toggle) pairs that with textDark for contrast; this one didn't, so
  // depending on the picked theme the muted text could read as barely
  // visible/gone against it (user feedback: "lost the lettering").
  textFlash: { color: colors.textDark },
  // Small indicator dot (not text dimming - see the comment above where
  // this renders) that the currently-shown slot has nothing saved yet.
  emptyDot: {
    position: 'absolute', bottom: 4, left: 4, width: 4, height: 4, borderRadius: 2,
    backgroundColor: colors.textMuted,
  },
  // Same top/bottom insets the old single-piece pivot line used - onLayout
  // measures this wrapper's real height (pivotHeight) so the line/dots
  // below can be positioned in exact pixels rather than percentages (an
  // unreliable RN layout path on Android for absolutely positioned views -
  // same reasoning as the drag sliders elsewhere in this app).
  pivotWrap: { position: 'absolute', right: 8, top: 10, bottom: 10, width: 6, alignItems: 'center' },
  // height/top are set inline per-render from the measured pivotHeight (see
  // where this renders) - centered vertically, only its height varies. No
  // left/right set here (or on pivotDot below) on purpose - an absolutely
  // positioned child with neither offset set still follows the parent's
  // alignItems in RN's Yoga layout, so pivotWrap's alignItems:'center'
  // centers these on the horizontal axis without needing to compute it here.
  pivotLine: { position: 'absolute', width: 1, backgroundColor: colors.neon },
  // width/height/borderRadius/opacity/top are all computed per-dot inline
  // (see pivotDots above) - this base style just fixes the color/position
  // type shared by every dot.
  pivotDot: { position: 'absolute', backgroundColor: colors.neon },
  // Same footprint as `button` so swapping into rename mode doesn't shift
  // any layout around it.
  renameBox: {
    width: 92, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 2, borderColor: colors.neon, ...buttonDepth,
    elevation: 0,
  },
  renameInput: { color: colors.textLight, fontWeight: '700', fontSize: 13, padding: 0 },
});
