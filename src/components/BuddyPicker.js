import React, { useState } from 'react';
import { Modal, View, Text, Image, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { buttonDepth, neonSelected } from '../constants';
import { BUDDY_AVATARS, BUDDY_KEYS } from '../buddyAvatars';

/**
 * First-launch "pick your buddy" screen - the chosen animal becomes the
 * Settings tab's icon in BottomNav (replacing a plain gear) and is meant to
 * make that corner of the app feel like it's actually yours, the way a
 * profile picture does elsewhere, rather than an admin/settings icon.
 * Reachable again later from Settings > Profile ("Change your buddy") to
 * pick a different one, via the same component - `onPick` is the only
 * thing that differs between the two call sites (App.js decides whether
 * dismissing without picking is allowed by whether it renders a close
 * button, via `onClose`).
 *
 * Design (and the animal art itself) came out of a design-canvas mockup
 * reviewed and refined with the user first - this is that same layout and
 * the same 9 illustrations, translated into the real app rather than a
 * from-scratch guess.
 *
 * Two device-width bugs fixed after a real report (a friend's Samsung
 * Galaxy FE, narrower than the phone this was built and tested against):
 * the grid used to size each cell to a fixed dp width with a fixed-px
 * `maxWidth` guess for 3 columns - fine on a ~412dp+ screen, but a ~360dp
 * screen made that guessed maxWidth wider than the actual available space,
 * silently wrapping to 2 columns. Cells are now percentage-widths of
 * whatever the grid's real width is, so 3-per-row holds on any screen.
 * Second, and worse: there was no ScrollView at all, so once the grid
 * wrapped taller than expected, the confirm button - the ONLY way past
 * this screen on first launch, no skip - got pushed completely off-screen
 * with nothing to scroll it back into view. The button and footnote are
 * now a fixed footer OUTSIDE the scrollable grid area, so they're always
 * on screen no matter how tall the grid renders or how short the device is.
 */
export default function BuddyPicker({ visible, currentKey, onPick, onClose }) {
  const { colors, accentColor } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);
  const [selected, setSelected] = useState(currentKey || null);

  const confirm = () => {
    if (!selected) return;
    onPick(selected);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={() => onClose?.()}>
      <View style={styles.backdrop}>
        {onClose && (
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        )}

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.eyebrow}>Welcome to Nomnom</Text>
          <Text style={styles.title}>Pick your buddy</Text>
          <Text style={styles.subtitle}>
            This little face is you around here. Change it whenever you want - no pressure.
          </Text>

          <View style={styles.grid}>
            {BUDDY_KEYS.map((key) => {
              const buddy = BUDDY_AVATARS[key];
              const isSelected = key === selected;
              return (
                <Pressable
                  key={key}
                  style={styles.cell}
                  onPress={() => setSelected(key)}
                >
                  <View
                    style={[
                      styles.frame,
                      isSelected ? { borderColor: accentColor, borderWidth: 3 } : { borderColor: colors.cardAlt, borderWidth: 2 },
                    ]}
                  >
                    <Image source={buddy.source} style={styles.image} resizeMode="cover" />
                    {isSelected && (
                      <View style={[styles.checkBadge, { backgroundColor: accentColor }]}>
                        <Ionicons name="checkmark" size={14} color={colors.textDark} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.buddyLabel, isSelected && { color: accentColor }]}>{buddy.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Fixed footer, outside the ScrollView - always on screen regardless
            of how tall the grid above renders (see the fix note above). */}
        <View style={styles.footer}>
          <Pressable
            style={[styles.confirmBtn, { backgroundColor: accentColor }, !selected && styles.confirmBtnDisabled]}
            onPress={confirm}
            disabled={!selected}
          >
            <Text style={[styles.confirmBtnText, { color: colors.textDark }]}>That's me &rarr;</Text>
          </Pressable>
          <Text style={styles.footnote}>Find this again anytime in your Profile tab</Text>
        </View>
      </View>
    </Modal>
  );
}

// Fraction of the grid row's own width, not a fixed dp guess - the exact
// bug that broke this on a narrower phone than it was built against (see
// the component docstring). 3 cells + 2 gaps must fit in 100%: (100 - 2*GAP_PCT)/3.
const GAP_PCT = 3;
const CELL_W_PCT = (100 - GAP_PCT * 2) / 3;
// The source art's own real aspect ratio (280x349 crops) - height follows
// from whatever the cell's actual (now percentage, device-dependent) width
// ends up being, instead of a second fixed dp guess.
const CELL_ASPECT = 280 / 349;

const makeStyles = (colors, insets) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1, alignItems: 'center',
    paddingTop: insets.top + 48, paddingHorizontal: 24, paddingBottom: 24,
  },
  closeBtn: { position: 'absolute', top: insets.top + 16, right: 20, padding: 8, zIndex: 1 },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  title: { color: colors.textLight, fontSize: 26, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300, marginBottom: 28 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    width: '100%', maxWidth: 420, rowGap: 18,
  },
  cell: { width: `${CELL_W_PCT}%`, alignItems: 'center', gap: 8 },
  frame: {
    width: '100%', aspectRatio: CELL_ASPECT, borderRadius: 18, overflow: 'hidden',
    backgroundColor: colors.cardAlt, position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  checkBadge: {
    position: 'absolute', bottom: -4, right: -4, width: 26, height: 26, borderRadius: 13,
    borderWidth: 3, borderColor: colors.background, alignItems: 'center', justifyContent: 'center',
  },
  buddyLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  footer: { alignItems: 'center', paddingHorizontal: 24, paddingBottom: insets.bottom + 24, paddingTop: 12 },
  confirmBtn: {
    width: '100%', maxWidth: 320, borderRadius: 999, paddingVertical: 16,
    alignItems: 'center', ...buttonDepth,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 16, fontWeight: '800' },
  footnote: { color: colors.textMuted, fontSize: 12, marginTop: 14 },
});
