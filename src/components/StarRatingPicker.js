import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';

// Whole stars only, 1-5 - no half/quarter steps (user request). One short
// word-label per value, shown beside the stars for whichever is picked.
export const RATING_LABELS = {
  1: "Don't",
  2: 'Not great',
  3: 'If convenient',
  4: 'Good',
  5: 'Excellent',
};

/**
 * Shared 1-5 star picker for both journal compose flows (DetailModal's
 * Journal box and AtTheTableCompose) so the scale/wording can't drift
 * apart again. `allowClear` lets tapping the already-picked star reset to
 * 0 (unrated) - only for flows where a rating is optional.
 */
export default function StarRatingPicker({ value, onChange, allowClear = false }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.wrap}>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            onPress={() => onChange(allowClear && n === value ? 0 : n)}
            hitSlop={4}
          >
            <Ionicons
              name={n <= value ? 'star' : 'star-outline'}
              size={30}
              color={colors.gold}
              style={{ marginRight: 6 }}
            />
          </Pressable>
        ))}
        <Text style={[styles.pickedLabel, !value && { color: colors.textMuted }]}>
          {value ? RATING_LABELS[value] : 'Tap a star'}
        </Text>
      </View>
      <View style={styles.legend}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Text key={n} style={[styles.legendItem, n === value && { color: colors.gold, fontWeight: '700' }]}>
            {n} - {RATING_LABELS[n]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  wrap: { marginBottom: 10 },
  starRow: { flexDirection: 'row', alignItems: 'center' },
  pickedLabel: { color: colors.gold, fontSize: 14, fontWeight: '700', marginLeft: 6, flexShrink: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  legendItem: { color: colors.textMuted, fontSize: 11, marginRight: 10, lineHeight: 16 },
});
