import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';
import { getReviewStats } from '../api/rewards';

/**
 * PROTOTYPE reward-system UI (see src/api/rewards.js for the "why" and the
 * caveat that this is a first-draft guess at an underspecified idea, not a
 * committed design). Renders one quiet inline line - no card, no border, no
 * background - meant to sit directly next to a city's header in
 * JournalOverlay.js's existing per-city grouping, not as its own separate
 * widget. `count` is the number of distinct places reviewed IN THAT CITY
 * (caller passes `spots.length` from a mineByCity bucket) - there is no
 * global/cross-city count anymore (see rewards.js's comment on why).
 */
export default function ReviewMilestoneBadge({ count }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  if (!count) return null;
  const { tier } = getReviewStats(count);

  return (
    <Text style={styles.text}>
      {tier.icon} {tier.name}
    </Text>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  text: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});
