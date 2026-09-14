import React, { useState } from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { neonSelected, buttonDepth } from '../constants';
import { useTheme } from '../ThemeContext';

/**
 * Floating action button that expands into: price filter ($-$$$$),
 * "Open now" toggle, and History / Favorites shortcuts.
 */
export default function FabMenu({
  visible,
  showFabMenu,
  setShowFabMenu,
  onOpenHistory,
  onOpenFavorites,
  onOpenTryLater,
  onOpenJournal,
  openNowOnly,
  onToggleOpenNow,
  maxPrice,
  setMaxPrice,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [showPriceOptions, setShowPriceOptions] = useState(false);

  if (!visible) return null;

  return (
    <>
      {showFabMenu && (
        <Pressable style={styles.backdrop} onPress={() => setShowFabMenu(false)} />
      )}
      <View style={styles.fabWrapper}>
        {showFabMenu && (
          <View style={styles.fabSubMenu}>
            {showPriceOptions && (
              <View style={styles.priceRow}>
                {[1, 2, 3, 4].map((level) => {
                  const active = maxPrice === level;
                  return (
                    <Pressable
                      key={level}
                      style={[styles.priceBtn, active && styles.priceBtnActive]}
                      onPress={() => setMaxPrice(active ? null : level)}
                    >
                      <Text style={[styles.priceText, active && styles.priceTextActive]}>
                        {'$'.repeat(level)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Pressable
              style={[styles.fabSubBtn, (maxPrice != null || showPriceOptions) && styles.fabSubBtnActive]}
              onPress={() => setShowPriceOptions((prev) => !prev)}
            >
              <Ionicons
                name="cash"
                size={20}
                color={maxPrice != null || showPriceOptions ? colors.textDark : colors.accent}
              />
            </Pressable>

            <Pressable
              style={[styles.fabSubBtn, openNowOnly && styles.fabSubBtnActive, { marginTop: 10 }]}
              onPress={onToggleOpenNow}
            >
              <MaterialCommunityIcons
                name={openNowOnly ? 'clock-check' : 'clock-check-outline'}
                size={22}
                color={openNowOnly ? colors.textDark : colors.accent}
              />
            </Pressable>
            <Pressable style={[styles.fabSubBtnSolid, { marginTop: 10 }]} onPress={onOpenHistory}>
              <Ionicons name="book" size={22} color={colors.textDark} />
            </Pressable>
            <Pressable style={[styles.fabSubBtnSolid, { marginTop: 10 }]} onPress={onOpenTryLater}>
              <Ionicons name="bookmark" size={22} color={colors.textDark} />
            </Pressable>
            <Pressable style={[styles.fabSubBtnSolid, { marginTop: 10 }]} onPress={onOpenFavorites}>
              <Ionicons name="heart" size={22} color={colors.textDark} />
            </Pressable>
            {/* "My Reviews" - the food journal (your own ratings/notes plus
                friends'), pen-and-paper icon so it reads as "notes" at a
                glance. */}
            <Pressable style={[styles.fabSubBtnSolid, { marginTop: 10 }]} onPress={onOpenJournal}>
              <Ionicons name="create" size={22} color={colors.textDark} />
            </Pressable>
          </View>
        )}
        <Pressable style={styles.fabMainBtn} onPress={() => setShowFabMenu(!showFabMenu)}>
          <Ionicons name="menu" size={22} color={colors.textDark} />
        </Pressable>
      </View>
    </>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 },
  // flex-end, not center - this column has no fixed width (it shrink-wraps
  // to content, anchored via `right: 30`), and the price row's $/$$/$$$/
  // $$$$ buttons aren't a fixed width either. With center alignment,
  // revealing a wider price button grew the column and re-centered every
  // fixed-size circular button within it, visibly shifting the whole stack
  // left (user feedback). Right-aligning instead keeps every button pinned
  // to the same edge no matter how wide the price row gets.
  fabWrapper: { position: 'absolute', bottom: 30, right: 30, alignItems: 'flex-end', zIndex: 50 },
  fabSubMenu: { marginBottom: 12, alignItems: 'flex-end' },
  priceRow: { flexDirection: 'column', alignItems: 'center', marginBottom: 8 },
  // elevation pinned constant (10, matching neonSelected's) whether active or
  // not - same fix as App.js's modeBtn/FilterPanel's toggleBtnSmall/
  // ResultCard's iconBtn: Android can leave a view stuck blank after its
  // elevation changes between renders (was 4 via buttonDepth -> 10 via
  // neonSelected, exactly that jump). Only backgroundColor/border/shadowColor
  // differ between states now.
  priceBtn: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accent, minWidth: 44, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 10, ...buttonDepth, elevation: 10 },
  priceBtnActive: { backgroundColor: colors.accent, ...neonSelected(colors) },
  priceText: { color: colors.accent, fontWeight: 'bold', fontSize: 13 },
  priceTextActive: { color: colors.textDark },
  // Same elevation-pin fix as priceBtn/priceBtnActive above (4 -> 10 toggle).
  fabSubBtn: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accent, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', ...buttonDepth, elevation: 10 },
  fabSubBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent, ...neonSelected(colors) },
  fabSubBtnSolid: { backgroundColor: colors.accent, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', ...buttonDepth },
  fabMainBtn: { backgroundColor: colors.accent, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', ...buttonDepth },
});
