import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { frostedGlow } from '../constants';
import FrostedGlass from './FrostedGlass';

const PRICE_LEVELS = [1, 2, 3, 4];

/**
 * Replaces FabMenu.js's hamburger-expand behavior with 3 always-visible
 * frosted-glass toggles (Price/Open Now/Favorites-only) - user request, once
 * BottomNav's own nav-only buttons already made the hamburger's remaining
 * job (these 3 filter toggles) the only thing left in it. Retiring the
 * expand/collapse step entirely matches the "fewer taps" goal the rest of
 * this redesign has been chasing - each toggle is now exactly 1 tap instead
 * of "tap hamburger, THEN tap toggle."
 *
 * Price has no on/off state, just 4 levels plus "off" - rather than expand a
 * row of 4 buttons (FabMenu's old approach), a single button cycles through
 * them (1→2→3→4→off→1...), showing the current level as its own label so it
 * never needs to expand into anything.
 */
export default function QuickFilters({
  visible, openNowOnly, onToggleOpenNow, favoritesOnly, onToggleFavoritesOnly,
  maxPrice, setMaxPrice,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  if (!visible) return null;

  const cyclePrice = () => {
    if (maxPrice == null) { setMaxPrice(PRICE_LEVELS[0]); return; }
    const idx = PRICE_LEVELS.indexOf(maxPrice);
    setMaxPrice(idx === PRICE_LEVELS.length - 1 ? null : PRICE_LEVELS[idx + 1]);
  };

  return (
    <View style={styles.stack} pointerEvents="box-none">
      <Toggle active={maxPrice != null} onPress={cyclePrice} colors={colors} styles={styles}>
        {maxPrice != null ? (
          <Text style={[styles.priceText, { color: colors.neon }]}>{'$'.repeat(maxPrice)}</Text>
        ) : (
          <Ionicons name="cash-outline" size={20} color={colors.textMuted} />
        )}
      </Toggle>
      <Toggle active={openNowOnly} onPress={onToggleOpenNow} colors={colors} styles={styles}>
        <MaterialCommunityIcons
          name={openNowOnly ? 'clock-check' : 'clock-check-outline'}
          size={22}
          color={openNowOnly ? colors.neon : colors.textMuted}
        />
      </Toggle>
      <Toggle active={favoritesOnly} onPress={onToggleFavoritesOnly} colors={colors} styles={styles}>
        <Ionicons
          name={favoritesOnly ? 'heart-circle' : 'heart-circle-outline'}
          size={24}
          color={favoritesOnly ? colors.neon : colors.textMuted}
        />
      </Toggle>
    </View>
  );
}

function Toggle({ active, onPress, children, colors, styles }) {
  return (
    <FrostedGlass
      style={styles.toggleRing}
      contentStyle={styles.toggleInner}
      radius={19}
      tintOpacity={active ? 0.28 : 0.12}
    >
      <Pressable
        style={[styles.toggleTouch, active && frostedGlow(colors), active && { elevation: 0 }]}
        onPress={onPress}
        hitSlop={6}
      >
        {children}
      </Pressable>
    </FrostedGlass>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // Same corner (bottom-right, above where the coin/nav sit) FabMenu used to
  // occupy - right:30 lines up with FabMenu's old anchor; bottom:170 clears
  // both the coin (roughly centered above BottomNav) and BottomNav's own
  // ~94px-tall footprint at the very bottom of the screen.
  stack: { position: 'absolute', bottom: 170, right: 30, alignItems: 'center', gap: 10, zIndex: 45 },
  toggleRing: { width: 38, height: 38 },
  toggleInner: { flex: 1 },
  toggleTouch: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, borderWidth: 1.5, borderColor: 'transparent',
  },
  priceText: { fontWeight: 'bold', fontSize: 13 },
});
