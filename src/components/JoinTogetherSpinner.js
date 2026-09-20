import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';

const STAGE_SIZE = 220;
const OUTER_RING_SIZE = 200;
const GYRO_OUTER_SIZE = 120;
const GYRO_INNER_SIZE = 76;
const CORE_SIZE = 60;
const AVATAR_SIZE = 44;
const ORBIT_RADIUS = 100;
const TILT_DEG = 58;

/**
 * "Pick Together" spinner - two avatars orbit slowly and calmly around a
 * pair of fast, cross-axis gyroscope rings, with the result revealed in the
 * glowing center. Design came out of a live-CSS mockup comparing a slow
 * avatar-orbit concept against a fast nested-gyroscope concept - the user
 * liked the calm pace of the first and the "wow factor" of the second, so
 * this merges them rather than picking one: the outer ring (avatars) never
 * changes pace, all the excitement happens in the inner rings when `phase`
 * moves to 'spinning'.
 *
 * DELIBERATELY BUILT AS A PLACEHOLDER, ARCHITECTED TO BE REPLACED:
 * this uses React Native's plain Animated API (linear/timing-based loops),
 * the same tech CoinSpinner.js already uses - it can approximate the shape
 * of the motion but not real weight, momentum, or a satisfying spring
 * settle. The plan (see chat) is to rebuild this exact visual in Rive once
 * that's learned, as a `.riv` file driven by a state machine with the same
 * three states this component already exposes (`phase`). When that swap
 * happens, everything outside this file (whatever screen renders it) should
 * need ZERO changes - that's why the props are already shaped like a state
 * machine (`phase`, `onSettled`) rather than a pile of ad-hoc booleans: a
 * Rive state machine's inputs/events map onto this exact same contract.
 *
 * @param {'idle'|'spinning'|'settled'} phase - 'idle': both rings idle at
 *   their calm resting pace (used while waiting for both players to join).
 *   'spinning': inner gyro rings accelerate hard - the actual "deciding"
 *   moment. 'settled': inner rings ease to a stop with the result showing
 *   in the core; outer avatar ring keeps orbiting regardless of phase - it
 *   represents the two people, not the suspense.
 * @param {{uri:string}|number} avatarA / avatarB - the two players' buddy
 *   avatar images (see buddyAvatars.js).
 * @param {{uri:string}|number} resultImage - shown in the core once
 *   `phase` is 'settled'; null shows a neutral placeholder glyph instead.
 * @param {() => void} onSettled - fires once the settle animation finishes
 *   after `phase` becomes 'settled' - the caller's cue to reveal the actual
 *   result card/screen underneath.
 */
export default function JoinTogetherSpinner({ phase = 'idle', avatarA, avatarB, resultImage, onSettled }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // Outer ring: constant slow orbit, independent of `phase` entirely (see
  // docstring - the calm pace is the point, it should never visibly react
  // to the spin/settle excitement happening inside it).
  const orbitAngle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(orbitAngle, { toValue: 1, duration: 9000, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Inner gyro rings: idle at a slow ambient pace, accelerate hard while
  // spinning, ease to a clean stop on settle. Two independent Animated.Value
  // loops (not one shared value) since the outer/inner gyro rings turn on
  // different axes at different rates - see the render below.
  const gyroOuterAngle = useRef(new Animated.Value(0)).current;
  const gyroInnerAngle = useRef(new Animated.Value(0)).current;
  const gyroLoopsRef = useRef({ outer: null, inner: null });

  useEffect(() => {
    gyroLoopsRef.current.outer?.stop();
    gyroLoopsRef.current.inner?.stop();

    const idleDuration = 3800;
    const spinDuration = 900;

    if (phase === 'settled') {
      // Ease to a stop rather than just halting - a spinning thing that
      // just freezes reads as broken, not "decided." +1 (not a fixed target
      // like 0) continues forward from wherever the loop left off, so the
      // rings glide to a stop instead of snapping backward first.
      Animated.parallel([
        Animated.timing(gyroOuterAngle, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(gyroInnerAngle, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) onSettled?.();
      });
      return;
    }

    const duration = phase === 'spinning' ? spinDuration : idleDuration;
    const outerLoop = Animated.loop(
      Animated.timing(gyroOuterAngle, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    );
    const innerLoop = Animated.loop(
      Animated.timing(gyroInnerAngle, { toValue: 1, duration: duration * 0.62, easing: Easing.linear, useNativeDriver: true })
    );
    gyroLoopsRef.current = { outer: outerLoop, inner: innerLoop };
    outerLoop.start();
    innerLoop.start();

    return () => {
      outerLoop.stop();
      innerLoop.stop();
    };
  }, [phase]);

  const orbitSpin = orbitAngle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const gyroOuterSpin = gyroOuterAngle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const gyroInnerSpin = gyroInnerAngle.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });

  return (
    <View style={styles.stage}>
      <View style={styles.tilt}>
        {/* Outer ring - the two avatars, always calm, always visible */}
        <Animated.View style={[styles.outerRing, { transform: [{ rotateZ: orbitSpin }] }]}>
          <View style={[styles.avatarSlot, { top: 0, left: OUTER_RING_SIZE / 2 - AVATAR_SIZE / 2 }]}>
            {avatarA ? <Image source={avatarA} style={styles.avatarImage} /> : <View style={styles.avatarFallback} />}
          </View>
          <View style={[styles.avatarSlot, { bottom: 0, left: OUTER_RING_SIZE / 2 - AVATAR_SIZE / 2 }]}>
            {avatarB ? <Image source={avatarB} style={styles.avatarImage} /> : <View style={styles.avatarFallback} />}
          </View>
        </Animated.View>

        {/* Inner gyro rings - fast, cross-axis, this is where the tension lives */}
        <Animated.View style={[styles.gyroOuter, { transform: [{ rotateY: gyroOuterSpin }] }]} />
        <Animated.View style={[styles.gyroInner, { transform: [{ rotateX: gyroInnerSpin }] }]} />

        {/* Core reveal */}
        <View style={styles.core}>
          {phase === 'settled' && resultImage ? (
            <Image source={resultImage} style={styles.coreImage} resizeMode="cover" />
          ) : (
            <View style={styles.coreDot} />
          )}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  stage: { width: STAGE_SIZE, height: STAGE_SIZE, alignItems: 'center', justifyContent: 'center' },
  // rotateX here is the whole assembly's tilt (matches the "gyroscopic,
  // viewed at an angle" look from the mockup) - everything nested inside
  // renders tilted along with it, same composition RN gives any transformed
  // parent.
  tilt: {
    width: OUTER_RING_SIZE, height: OUTER_RING_SIZE,
    alignItems: 'center', justifyContent: 'center',
    transform: [{ perspective: 800 }, { rotateX: `${TILT_DEG}deg` }],
  },
  outerRing: {
    position: 'absolute', width: OUTER_RING_SIZE, height: OUTER_RING_SIZE, borderRadius: OUTER_RING_SIZE / 2,
    borderWidth: 2, borderColor: colors.accent, borderStyle: 'dashed',
  },
  avatarSlot: { position: 'absolute', width: AVATAR_SIZE, height: AVATAR_SIZE },
  avatarImage: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 },
  avatarFallback: { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, backgroundColor: colors.cardAlt },
  gyroOuter: {
    position: 'absolute', width: GYRO_OUTER_SIZE, height: GYRO_OUTER_SIZE, borderRadius: GYRO_OUTER_SIZE / 2,
    borderWidth: 5, borderColor: colors.accent,
  },
  gyroInner: {
    position: 'absolute', width: GYRO_INNER_SIZE, height: GYRO_INNER_SIZE, borderRadius: GYRO_INNER_SIZE / 2,
    borderWidth: 4, borderColor: colors.neon,
  },
  core: {
    position: 'absolute', width: CORE_SIZE, height: CORE_SIZE, borderRadius: CORE_SIZE / 2,
    backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  coreImage: { width: '100%', height: '100%' },
  coreDot: { width: CORE_SIZE * 0.4, height: CORE_SIZE * 0.4, borderRadius: CORE_SIZE * 0.2, backgroundColor: colors.accentDark },
});
