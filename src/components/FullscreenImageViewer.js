import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Animated, Pressable, Text, StyleSheet, FlatList, PanResponder,
  ScrollView, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
// Pinching back down below this on release snaps fully back to 1x/centered,
// rather than leaving it at some barely-zoomed-in value.
const RESET_SCALE_THRESHOLD = 1.05;
// Same px/ms convention as CoinSpinner's FLICK_VELOCITY_THRESHOLD - how fast
// a release has to be to count as a deliberate swipe rather than just
// finishing a slow pan.
const FAST_SWIPE_VELOCITY = 0.5;
// How close to a pan boundary counts as "actually at the edge" (float math/
// touch jitter means it rarely lands on the exact clamped value).
const EDGE_EPSILON_PX = 2;
// Below this total movement, a release counts as a tap (dismiss) rather
// than a swipe - same convention as CoinSpinner's TAP_MOVEMENT_THRESHOLD_PX.
const TAP_MOVEMENT_THRESHOLD_PX = 10;
// A real two-finger pinch's fingers essentially never lift in the exact
// same instant - one lifts a beat before the other. That first lift ends
// the tracked gesture correctly (committing the zoom), but the still-down
// second finger's OWN later lift then starts a brand new touch cycle from
// this responder's perspective: a fresh grant with only 1 touch, followed
// almost immediately by its release, with essentially no movement of its
// own - which is indistinguishable from a genuine tap. Ignoring a
// would-be tap that lands this soon after a real gesture just ended is
// what stops that phantom trailing-finger lift from being read as "tap to
// dismiss" (user report: pinching zoomed the photo correctly, but then it
// immediately closed anyway).
const PHANTOM_TAP_COOLDOWN_MS = 400;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Fullscreen tap-to-expand / tap-to-shrink-back photo viewer, shared by
 * every spot-photo location in the app (detail modal, result card,
 * elimination rows, history/favorites, browse list, journal photos). Pass a
 * `photos` array (even for a single image, wrap it in a 1-item array) +
 * which one was tapped as `initialIndex` - if there's more than one, it's
 * swipeable (a horizontal drag on the image, or the dots-style counter is
 * purely informational). Tapping the backdrop or the close button always
 * dismiss; tapping the image itself only dismisses while NOT zoomed - while
 * zoomed a release is always treated as a pan/edge-swipe instead, never a
 * dismiss (see the gesture breakdown below).
 *
 * Pinch-to-zoom (user request), with the zoom level maintained after
 * pinching rather than snapping back - swiping between photos, panning
 * within a zoomed one, and tap-to-dismiss all live on the same image, via a
 * SINGLE PanResponder that claims every touch itself:
 *   - Not zoomed, single finger, released with barely any movement: a tap -
 *     dismisses.
 *   - Not zoomed, single finger, released after a clear horizontal move:
 *     advances to the next/previous photo (via FlatList.scrollToIndex,
 *     driven programmatically - FlatList's own touch-driven paging is off,
 *     see scrollEnabled below).
 *   - Zoomed (scale > 1): a single-finger drag pans around the zoomed
 *     image, clamped so you can't pan past its edges. A FAST drag that ends
 *     pinned against an edge (both conditions - user request) advances to
 *     the next/previous photo instead; a slow drag, or a fast one that
 *     isn't at an edge, just leaves the image panned wherever you moved it.
 *   - Two fingers: always pinches, regardless of pan/zoom state.
 * This used to split tap-to-dismiss onto an outer Pressable wrapping this
 * same image, and let a not-yet-zoomed single finger fall through
 * undeclined to FlatList's native paging. That looked reasonable but broke
 * pinch entirely: Pressable becomes the active touch responder on the
 * FIRST finger (since this responder deliberately declined a lone,
 * unzoomed finger at the time - it didn't know yet it might turn into a
 * pinch), and confirmed against how RN's responder system actually works,
 * Pressable then does not hand off to a second finger landing moments
 * later - so a pinch could only ever fire if both fingers touched down in
 * the exact same event, which in practice they essentially never do (user
 * report: pinch doesn't work). Consolidating everything here avoids that
 * ancestor-Pressable-steals-the-first-finger problem altogether - same
 * lesson as this app's other Pressable+PanResponder conflicts (see
 * CoinSpinner.js, FaveCuisineButton.js).
 * No react-native-gesture-handler/Reanimated dependency - this app
 * deliberately stays on plain core-RN Animated/PanResponder throughout (see
 * CoinSpinner.js's docstring for why), and PanResponder's raw
 * `evt.nativeEvent.touches` array already exposes enough multi-touch data
 * to hand-roll pinch distance/midpoint math without a new native dependency.
 *
 * Zoom/pan state is centralized here (not per-FlatList-item) and reset
 * whenever the visible `index` changes, rather than tracked independently
 * per photo - simpler, and matches how most photo viewers behave (each
 * photo starts fresh when you swipe to it), at the cost of not remembering
 * a zoom level if you swipe away and back to the same photo.
 */
export default function FullscreenImageViewer({ visible, photos, initialIndex = 0, onClose, caption, noteTexts }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const flatListRef = useRef(null);

  // Reassigned every render so the frozen PanResponder callbacks (see
  // useRef below) always read the CURRENT index/dimensions, not whichever
  // render first built the responder - same stale-closure fix used
  // throughout this codebase (CoinSpinner, RollingFoodStrip, FilterPanel).
  const indexRef = useRef(index);
  indexRef.current = index;
  const photosLengthRef = useRef(photos?.length || 0);
  photosLengthRef.current = photos?.length || 0;

  const photoWidth = width - 32;
  const photoHeight = height * 0.7;
  const dimsRef = useRef({ photoWidth, photoHeight });
  dimsRef.current = { photoWidth, photoHeight };

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  // Plain synchronously-readable mirrors of the three values above - set
  // directly alongside every setValue() call (not via a native listener),
  // since none of this gesture-tracking runs on the native driver (it's
  // direct per-touch-move manipulation, not a timing/spring animation) so
  // there's no async native round-trip to go stale.
  const scaleRef = useRef(1);
  const translateXRef = useRef(0);
  const translateYRef = useRef(0);

  const maxOffsetX = (s) => Math.max(0, (dimsRef.current.photoWidth * s - dimsRef.current.photoWidth) / 2);
  const maxOffsetY = (s) => Math.max(0, (dimsRef.current.photoHeight * s - dimsRef.current.photoHeight) / 2);

  const applyScale = (s) => {
    scaleRef.current = s;
    scale.setValue(s);
    // Re-clamp pan to the new scale's valid range so zooming back out
    // doesn't leave the image stuck panned past its (now smaller) edge.
    const mx = maxOffsetX(s);
    const my = maxOffsetY(s);
    const clampedX = clamp(translateXRef.current, -mx, mx);
    const clampedY = clamp(translateYRef.current, -my, my);
    translateXRef.current = clampedX;
    translateX.setValue(clampedX);
    translateYRef.current = clampedY;
    translateY.setValue(clampedY);
  };

  const resetZoom = (animated = true) => {
    scaleRef.current = 1;
    translateXRef.current = 0;
    translateYRef.current = 0;
    setZoomed(false);
    if (animated) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 4 }),
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20, bounciness: 4 }),
      ]).start();
    } else {
      scale.setValue(1);
      translateX.setValue(0);
      translateY.setValue(0);
    }
  };

  // Fresh, unzoomed start every time the visible photo changes - whether
  // from a normal swipe (onMomentumScrollEnd below) or a fast-swipe-at-edge
  // advance triggered from inside a zoomed pan (goToIndex below).
  useEffect(() => {
    resetZoom(false);
  }, [index]);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  const goToIndex = (newIndex) => {
    if (newIndex < 0 || newIndex >= photosLengthRef.current) return;
    flatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
  };

  const getDistance = (touches) => {
    const [a, b] = touches;
    return Math.sqrt((a.pageX - b.pageX) ** 2 + (a.pageY - b.pageY) ** 2);
  };

  const gestureRef = useRef({
    initialDistance: 0, initialScale: 1, startTranslateX: 0, startTranslateY: 0,
    twoFinger: false, panning: false, lastGestureEndAt: 0,
  });

  const panResponder = useRef(
    PanResponder.create({
      // Claims every touch, always - see the docstring above for why a
      // narrower claim (only pinch/zoomed-pan) let an ancestor Pressable
      // steal a would-be pinch's first finger. Tap-to-dismiss and
      // unzoomed swipe-to-next/prev are now resolved here too, in
      // onPanResponderRelease below.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        const g = gestureRef.current;
        g.panning = false;
        g.twoFinger = touches.length === 2;
        if (g.twoFinger) {
          g.initialDistance = getDistance(touches);
          g.initialScale = scaleRef.current;
        } else {
          g.startTranslateX = translateXRef.current;
          g.startTranslateY = translateYRef.current;
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        const g = gestureRef.current;
        if (touches.length === 2) {
          g.twoFinger = true;
          if (!g.initialDistance) {
            g.initialDistance = getDistance(touches);
            g.initialScale = scaleRef.current;
            return;
          }
          const dist = getDistance(touches);
          applyScale(clamp(g.initialScale * (dist / g.initialDistance), MIN_SCALE, MAX_SCALE));
          return;
        }
        if (touches.length === 1 && scaleRef.current > 1.01) {
          g.panning = true;
          const mx = maxOffsetX(scaleRef.current);
          const my = maxOffsetY(scaleRef.current);
          const newX = clamp(g.startTranslateX + gestureState.dx, -mx, mx);
          const newY = clamp(g.startTranslateY + gestureState.dy, -my, my);
          translateXRef.current = newX;
          translateX.setValue(newX);
          translateYRef.current = newY;
          translateY.setValue(newY);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        const g = gestureRef.current;
        if (g.twoFinger) {
          g.twoFinger = false;
          g.initialDistance = 0;
          g.lastGestureEndAt = Date.now();
          if (scaleRef.current < RESET_SCALE_THRESHOLD) resetZoom();
          else setZoomed(true);
          return;
        }
        if (g.panning && scaleRef.current > 1.01) {
          g.lastGestureEndAt = Date.now();
          const mx = maxOffsetX(scaleRef.current);
          // "At the edge" - pinned against the clamped boundary, i.e. no
          // more of the image left to reveal in that direction.
          const atRightEdge = translateXRef.current <= -mx + EDGE_EPSILON_PX;
          const atLeftEdge = translateXRef.current >= mx - EDGE_EPSILON_PX;
          const fast = Math.abs(gestureState.vx) > FAST_SWIPE_VELOCITY;
          // Both conditions required (user request): fast AND at the edge.
          // A slow drag, or a fast one that isn't pinned to an edge, just
          // leaves the image panned where the move handler above already
          // put it - no further action needed here.
          if (fast && gestureState.vx < 0 && atRightEdge) {
            goToIndex(indexRef.current + 1);
          } else if (fast && gestureState.vx > 0 && atLeftEdge) {
            goToIndex(indexRef.current - 1);
          }
          return;
        }
        // Not zoomed, single finger, no pinch - a tap (dismiss) or a
        // horizontal swipe (advance photo). Mirrors what Pressable + FlatList's
        // native paging used to give us for free, now resolved by hand since
        // this responder claims the touch itself (see docstring above).
        // The cooldown guard goes first - see PHANTOM_TAP_COOLDOWN_MS.
        const distMoved = Math.sqrt(gestureState.dx ** 2 + gestureState.dy ** 2);
        const sincePriorGesture = Date.now() - g.lastGestureEndAt;
        if (distMoved < TAP_MOVEMENT_THRESHOLD_PX && sincePriorGesture < PHANTOM_TAP_COOLDOWN_MS) {
          // Almost certainly a trailing finger's own lift right after a
          // real pinch/pan just ended - ignore it rather than dismiss.
        } else if (distMoved < TAP_MOVEMENT_THRESHOLD_PX) {
          onClose();
        } else if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
          if (gestureState.dx < 0) goToIndex(indexRef.current + 1);
          else goToIndex(indexRef.current - 1);
        }
      },
      onPanResponderTerminate: () => {
        // Belt-and-suspenders alongside onPanResponderTerminationRequest
        // below: if this fires anyway, still commit an in-progress pinch
        // instead of silently dropping it (mirrors the two-finger branch
        // of onPanResponderRelease above).
        const g = gestureRef.current;
        if (g.twoFinger && scaleRef.current >= RESET_SCALE_THRESHOLD) setZoomed(true);
        g.twoFinger = false;
        g.initialDistance = 0;
        g.panning = false;
        g.lastGestureEndAt = Date.now();
      },
      // This view lives inside FlatList's renderItem - a ScrollView, whose
      // native pan gesture recognizer can still contest for the responder
      // mid-gesture even with scrollEnabled={false} (that prop stops it
      // from actually scrolling, not from existing/negotiating at the
      // native level). Losing responder-hood mid-pinch calls
      // onPanResponderTerminate above, which resets twoFinger to false -
      // so the finger-lift that follows lands in onPanResponderRelease's
      // final (not-a-pinch) branch and reads as a plain tap, dismissing
      // the viewer (user report: pinching closes the photo instead of
      // zooming it). Same fix, same reasoning, as FaveCuisineButton.js's
      // ScrollView conflict: refuse to yield once granted.
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  if (!photos || photos.length === 0) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <FlatList
          ref={flatListRef}
          data={photos}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          // Always off - the pan responder below claims every touch itself
          // now (see its docstring) and drives page changes via
          // goToIndex/scrollToIndex programmatically; FlatList's own
          // touch-driven paging would never actually get a touch to
          // respond to, but leaving this on invited exactly the kind of
          // native-vs-JS-responder conflict that broke pinch.
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            // No Pressable here (see docstring) - the pan responder below
            // owns tap-to-dismiss itself now.
            <View style={[styles.page, { width }]} {...panResponder.panHandlers}>
              <Animated.Image
                source={{ uri: item }}
                resizeMode="contain"
                style={[
                  { width: photoWidth, height: photoHeight },
                  { transform: [{ translateX }, { translateY }, { scale }] },
                ]}
              />
            </View>
          )}
        />
        {/* top/bottom overridden inline with real insets (base styles below
            keep the flat 50/40 guesses as the fallback default only) - a
            flat guess here risked sitting too close to an iPhone Dynamic
            Island/notch or a bottom gesture bar on devices with a bigger
            inset than whatever this was tuned against. */}
        <Pressable style={[styles.closeBtn, { top: insets.top + 10 }]} onPress={onClose} hitSlop={16}>
          <Ionicons name="close" size={30} color="#FFF" />
        </Pressable>
        {photos.length > 1 ? (
          // Moved up to top-center instead of its usual bottom-center spot
          // whenever a noteTexts panel is also showing (the journal-moments
          // case) - the panel's height varies with how much text is on the
          // current photo, and a fixed bottom offset would get buried under
          // it rather than reliably clearing it.
          <View
            style={[styles.counter, noteTexts ? { top: insets.top + 16, bottom: undefined } : { bottom: insets.bottom + 10 }]}
            pointerEvents="none"
          >
            <Text style={styles.counterText}>{index + 1} / {photos.length}</Text>
          </View>
        ) : caption ? (
          // Same slot/style as the counter above - the two never coexist in
          // practice (a caption is only ever passed for a single shared
          // photo, and the counter only shows past 1), so sharing the
          // bottom-center spot keeps this from needing its own layout.
          <View style={[styles.counter, { bottom: insets.bottom + 10 }]} pointerEvents="none">
            <Text style={styles.counterText}>{caption}</Text>
          </View>
        ) : null}
        {/* Journal moment notes (DetailModal's renderMomentEntry) - unlike
            caption/counter above, this is a real interactive panel (own
            ScrollView, not pointerEvents:"none") since notes can run long
            (user request: "the text also needs to move with the image in
            full screen and also be scrollable"). Capped height so it never
            swallows the whole photo, and sits below the image's own pinch/
            pan/swipe zone rather than overlapping it.
            noteTexts[index] tracks whichever photo is currently swiped to -
            when a later photo has no text of its own, the caller (see
            DetailModal's carry-forward fill) has already repeated the last
            real one into this slot, so it stays on screen instead of
            vanishing (user request). */}
        {!!noteTexts?.[index] && (
          <View style={[styles.notePanel, { paddingBottom: insets.bottom + 14 }]}>
            <ScrollView showsVerticalScrollIndicator>
              <Text style={styles.notePanelText}>{noteTexts[index]}</Text>
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  page: { alignItems: 'center', justifyContent: 'center' },
  // top/bottom here are just fallback defaults - the real per-device values
  // (insets.top/insets.bottom + a small breathing-room gap) are applied
  // inline where these are used, since a bare StyleSheet has no access to
  // useSafeAreaInsets().
  closeBtn: { position: 'absolute', top: 50, right: 20, padding: 8 },
  counter: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
  },
  counterText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  notePanel: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '30%',
    backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 20, paddingTop: 14,
  },
  notePanelText: { color: '#FFF', fontSize: 15, lineHeight: 22 },
});
