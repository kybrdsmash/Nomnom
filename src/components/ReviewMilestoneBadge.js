import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';
import { getReviewStats } from '../api/rewards';

/**
 * PROTOTYPE reward-system UI (see src/api/rewards.js for the "why" and the
 * caveat that this is a first-draft guess at an underspecified idea, not a
 * committed design). A quiet status card, derived entirely from the local
 * journal already loaded by the screen that renders this - no new storage,
 * no network call, no props beyond `journal`. Deliberately isolated so
 * dropping this direction later is a one-line removal wherever it's mounted.
 *
 * Renders nothing until the user has at least one reviewed place, so it
 * never shows up as an empty/zero state nagging someone to start.
 */
export default function ReviewMilestoneBadge({ journal }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { count, tier, next, toNext } = getReviewStats(journal);

  if (count === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{tier.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.tierName}>{tier.name}</Text>
        <Text style={styles.sub}>
          {count} place{count === 1 ? '' : 's'} reviewed
          {next ? ` · ${toNext} more to ${next.name}` : ' · top tier!'}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  icon: { fontSize: 26, marginRight: 12 },
  tierName: { color: colors.gold, fontSize: 14, fontWeight: 'bold' },
  sub: { color: colors.textMuted, fontSize: 11.5, marginTop: 3 },
});
