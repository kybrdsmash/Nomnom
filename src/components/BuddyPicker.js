import React, { useState } from 'react';
import { Modal, View, Text, Image, Pressable, StyleSheet } from 'react-native';
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

        <Pressable
          style={[styles.confirmBtn, { backgroundColor: accentColor }, !selected && styles.confirmBtnDisabled]}
          onPress={confirm}
          disabled={!selected}
        >
          <Text style={[styles.confirmBtnText, { color: colors.textDark }]}>That's me &rarr;</Text>
        </Pressable>
        <Text style={styles.footnote}>Find this again anytime in your Profile tab</Text>
      </View>
    </Modal>
  );
}

const CELL_W = 96;
const CELL_H = 116;

const makeStyles = (colors, insets) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: colors.background, alignItems: 'center',
    paddingTop: insets.top + 48, paddingHorizontal: 24, paddingBottom: insets.bottom + 24,
  },
  closeBtn: { position: 'absolute', top: insets.top + 16, right: 20, padding: 8, zIndex: 1 },
  eyebrow: { color: colors.accent, fontSize: 13, fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  title: { color: colors.textLight, fontSize: 26, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300, marginBottom: 28 },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 18, maxWidth: CELL_W * 3 + 36,
  },
  cell: { width: CELL_W, alignItems: 'center', gap: 8 },
  frame: {
    width: CELL_W, height: CELL_H, borderRadius: 18, overflow: 'hidden',
    backgroundColor: colors.cardAlt, position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  checkBadge: {
    position: 'absolute', bottom: -4, right: -4, width: 26, height: 26, borderRadius: 13,
    borderWidth: 3, borderColor: colors.background, alignItems: 'center', justifyContent: 'center',
  },
  buddyLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  confirmBtn: {
    marginTop: 'auto', width: '100%', maxWidth: 320, borderRadius: 999, paddingVertical: 16,
    alignItems: 'center', ...buttonDepth,
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { fontSize: 16, fontWeight: '800' },
  footnote: { color: colors.textMuted, fontSize: 12, marginTop: 14 },
});
