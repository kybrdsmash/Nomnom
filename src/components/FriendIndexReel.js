import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, PanResponder, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';

/**
 * The little "scroll reel" beside Feast's scrollable friends grid (user
 * spec): a vertical column of dots - one per starting letter actually
 * present - with the current letter shown as a bubble at the top. Fades in
 * while the grid is being scrolled (or the reel itself is touched) and back
 * out once things settle, so it never competes with the tiles at rest.
 *
 * Tap OR drag anywhere on the dots to jump the grid to that letter
 * (`onSelectLetter`) - the caller owns the ScrollView and does the actual
 * scrollTo, same split as AlphabetIndexBar. Unlike that bar, only letters
 * with real entries render here: this reel is tiny (the grid viewport is
 * ~1.5 rows tall), so 27 fixed slots would be unreadable.
 *
 * pointerEvents is 'none' while hidden so the invisible reel can't eat taps
 * meant for the rightmost tile underneath it - it becomes touchable the
 * moment a scroll gesture reveals it.
 */
export default function FriendIndexReel({
  letters, activeLetter, visible, onSelectLetter, onInteractStart, onInteractEnd,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const opacity = useRef(new Animated.Value(0)).current;
  const dotsHeight = useRef(0);
  // Refs so the (created-once) PanResponder below never sees stale props.
  const lettersRef = useRef(letters);
  const callbacksRef = useRef({ onSelectLetter, onInteractStart, onInteractEnd });
  lettersRef.current = letters;
  callbacksRef.current = { onSelectLetter, onInteractStart, onInteractEnd };

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 120 : 280,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  const letterAt = (locationY) => {
    const list = lettersRef.current;
    const pitch = dotsHeight.current / (list.length || 1);
    if (!pitch) return null;
    const index = Math.min(list.length - 1, Math.max(0, Math.floor(locationY / pitch)));
    return list[index] ?? null;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Sits inside two vertical ScrollViews - without this, the outer one
      // steals the gesture the moment a drag starts moving.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        callbacksRef.current.onInteractStart?.();
        const letter = letterAt(evt.nativeEvent.locationY);
        if (letter) callbacksRef.current.onSelectLetter?.(letter);
      },
      onPanResponderMove: (evt) => {
        const letter = letterAt(evt.nativeEvent.locationY);
        if (letter) callbacksRef.current.onSelectLetter?.(letter);
      },
      onPanResponderRelease: () => callbacksRef.current.onInteractEnd?.(),
      onPanResponderTerminate: () => callbacksRef.current.onInteractEnd?.(),
    })
  ).current;

  if (!letters?.length) return null;
  const shown = activeLetter || letters[0];

  return (
    <Animated.View style={[styles.reel, { opacity }]} pointerEvents={visible ? 'auto' : 'none'}>
      <View style={styles.letterBubble}>
        <Text style={styles.letterText}>{shown}</Text>
      </View>
      <View
        style={styles.dots}
        onLayout={(e) => { dotsHeight.current = e.nativeEvent.layout.height; }}
        {...pan.panHandlers}
      >
        {letters.map((letter) => (
          <View key={letter} style={[styles.dot, letter === shown && styles.dotActive]} />
        ))}
      </View>
    </Animated.View>
  );
}

const REEL_WIDTH = 18;

const makeStyles = (colors) => StyleSheet.create({
  reel: {
    position: 'absolute', right: -4, top: 0, bottom: 0, width: REEL_WIDTH,
    alignItems: 'center',
  },
  letterBubble: {
    width: REEL_WIDTH, height: REEL_WIDTH, borderRadius: REEL_WIDTH / 2,
    backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center',
  },
  letterText: { color: colors.textDark, fontSize: 10, fontWeight: '800', lineHeight: 12 },
  // Wider touch target than the dots themselves - a 3px dot is nothing to
  // aim at; the whole column strip is what responds.
  dots: {
    flex: 1, width: REEL_WIDTH, alignItems: 'center', justifyContent: 'space-evenly',
    paddingVertical: 3,
  },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textMuted, opacity: 0.7 },
  dotActive: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.neon, opacity: 1 },
});
