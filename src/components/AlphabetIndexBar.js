import React, { useRef } from 'react';
import { View, Text, PanResponder, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

/**
 * Vertical A-Z strip (iOS Contacts-style) for jumping a long, alphabetized
 * list to a given starting letter - tap a letter, or drag/scrub up and down
 * the whole strip for continuous scrubbing. Every letter always renders
 * (not just ones with real entries) so the strip's spacing stays constant
 * regardless of what's actually present; `availableLetters` just controls
 * which ones look "live" (full opacity) vs. dimmed - tapping a dimmed one
 * that has nothing under it is a harmless no-op via `onSelectLetter`.
 *
 * Caller owns the actual scroll-to-position logic (see
 * HistoryFavoritesOverlay.js/JournalOverlay.js) - this component only ever
 * reports "the user wants letter X," never touches a ScrollView itself.
 */
export default function AlphabetIndexBar({ onSelectLetter, availableLetters }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const barHeight = useRef(0);

  const letterAt = (locationY) => {
    const rowHeight = barHeight.current / LETTERS.length;
    if (!rowHeight) return null;
    const index = Math.min(LETTERS.length - 1, Math.max(0, Math.floor(locationY / rowHeight)));
    return LETTERS[index];
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const letter = letterAt(evt.nativeEvent.locationY);
        if (letter) onSelectLetter(letter);
      },
      onPanResponderMove: (evt) => {
        const letter = letterAt(evt.nativeEvent.locationY);
        if (letter) onSelectLetter(letter);
      },
    })
  ).current;

  return (
    <View
      style={styles.bar}
      onLayout={(e) => { barHeight.current = e.nativeEvent.layout.height; }}
      {...pan.panHandlers}
    >
      {LETTERS.map((letter) => (
        <Text
          key={letter}
          style={[styles.letter, !availableLetters?.has(letter) && styles.letterDim]}
        >
          {letter}
        </Text>
      ))}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  bar: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 18,
    justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4,
  },
  letter: { fontSize: 10, fontWeight: '700', color: colors.accent, lineHeight: 12 },
  letterDim: { color: colors.textMuted, opacity: 0.4 },
});
