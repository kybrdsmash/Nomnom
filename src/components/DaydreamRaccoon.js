import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../ThemeContext';
import { neonSelected, accentGradient, useVerticalScale } from '../constants';
import { FOODS } from '../foods';

const CYCLE_MS = 2200; // how long each food stays up before crossfading
const FADE_MS = 280;

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
 */
export default function DaydreamRaccoon() {
  const { colors } = useTheme();
  const vscale = useVerticalScale();
  const styles = makeStyles(colors, vscale);
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % FOODS.length);
        Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
      });
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.wrap}>
      <Image
        source={require('../../assets/daydream-raccoon.png')}
        style={styles.raccoon}
        resizeMode="contain"
      />
      <View style={styles.trailDotSmall} />
      <View style={styles.trailDotBig} />
      <View style={styles.bubble}>
        <LinearGradient {...accentGradient(colors)} style={StyleSheet.absoluteFill} />
        <Animated.Image source={FOODS[index].image} style={[styles.foodIcon, { opacity }]} resizeMode="contain" />
      </View>
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
