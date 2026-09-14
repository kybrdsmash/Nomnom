import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Animated, Pressable, Text, StyleSheet, FlatList, PanResponder, useWindowDimensions,
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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Fullscreen tap-to-expand / tap-to-shrink-back photo viewer, shared by
 * every spot-photo location in the app (detail modal, result card,
 * elimination rows, history/favorites, browse list, journal photos). Pass a
 * `photos` array (even for a single image, wrap it in a 1-item array) +
 * which one was tapped as `initialIndex` - if there's more than one, it's
 * swipeable via FlatList paging. Tapping the backdrop or the close button
 * always dismiss; tapping the image itself only dismisses while NOT zoomed
 * (see below for why that falls out of the gesture design for free).
 *
 * Pinch-to-zoom (user request), with the zoom level maintained after
 * pinching rather than snapping back - swiping between photos and panning
 * within a zoomed one both live on the same image, disambiguated like this:
 *   - Not zoomed: FlatList's own built-in horizontal paging handles
 *     swiping between photos exactly as before - this component's own pan
 *     responder deliberately DECLINES to claim a single-finger touch in
 *     this state (see panResponder.onStartShouldSetPanResponder), so nothing
 *     changes for the common case.
 *   - Zoomed (scale > 1): a single-finger drag pans around the zoomed
 *     image, clamped so you can't pan past its edges. A FAST drag that ends
 *     pinned against an edge (both conditions - user request) advances to
 *     the next/previous photo instead (via FlatList.scrollToIndex); a slow
 *     drag, or a fast one that isn't at an edge, just leaves the image
 *     panned wherever you moved it.
 *   - Two fingers: always pinches, regardless of pan/zoom state.
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
export default function FullscreenImageViewer({ visible, photos, initialIndex = 0, onClose }) {
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

  const gestureRef = useRef({ initialDistance: 0, initialScale: 1, startTranslateX: 0, startTranslateY: 0, twoFinger: false, panning: false });

  const panResponder = useRef(
    PanResponder.create({
      // Deliberately narrow: only claim a touch when there's something for
      // THIS responder to actually do (a pinch, or a pan while already
      // zoomed). Everything else - a plain tap, or a single-finger swipe
      // while not zoomed - passes through untouched to the outer Pressable
      // (tap to dismiss) and FlatList's own paging gesture, exactly as
      // before this feature existed.
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2 || scaleRef.current > 1.01,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2 || scaleRef.current > 1.01,
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
          if (scaleRef.current < RESET_SCALE_THRESHOLD) resetZoom();
          else setZoomed(true);
          return;
        }
        if (g.panning && scaleRef.current > 1.01) {
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
        }
      },
      onPanResponderTerminate: () => {
        gestureRef.current.twoFinger = false;
        gestureRef.current.initialDistance = 0;
      },
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
          // Off while zoomed so FlatList's own scroll gesture doesn't also
          // try to page at the same time as the pan responder above is
          // panning the zoomed image - programmatic scrollToIndex (used by
          // goToIndex on a fast edge-swipe) still works regardless of this.
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            // Tap-to-dismiss lives on this OUTER Pressable, untouched from
            // before. It naturally stops firing while zoomed - not because
            // of any extra logic here, but because the inner pan responder
            // claims the touch first once scale > 1 (see
            // onStartShouldSetPanResponder above), which preempts this
            // Pressable's own tap recognition for as long as that's true.
            <Pressable style={[styles.page, { width }]} onPress={onClose}>
              <View {...panResponder.panHandlers}>
                <Animated.Image
                  source={{ uri: item }}
                  resizeMode="contain"
                  style={[
                    { width: photoWidth, height: photoHeight },
                    { transform: [{ translateX }, { translateY }, { scale }] },
                  ]}
                />
              </View>
            </Pressable>
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
        {photos.length > 1 && (
          <View style={[styles.counter, { bottom: insets.bottom + 10 }]} pointerEvents="none">
            <Text style={styles.counterText}>{index + 1} / {photos.length}</Text>
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
});
