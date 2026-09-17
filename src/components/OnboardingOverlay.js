import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth, neonSelected } from '../constants';

// Kept deliberately short - 4 steps covering just the core loop (spin),
// the one filter people actually need day-to-day (cuisines), where saved
// spots live, and where to customize/get help - NOT a feature tour of
// everything the app can do (the in-app Help guide is that; this is meant
// to be skimmable in under 15 seconds, not a substitute for it).
const STEPS = [
  {
    icon: 'restaurant',
    title: 'Welcome to Nomnom',
    body: "Can't decide where to eat? Tap the coin to get a pick nearby - that's the whole app in one move.",
  },
  {
    icon: 'fast-food-outline',
    title: 'Narrow it down',
    body: 'Tap Cuisines to filter by what you\'re craving - or leave it blank for a total surprise.',
  },
  {
    icon: 'heart-outline',
    title: 'Save what you love',
    body: 'Favorite a spot, bookmark one for later, or jot a note in your Journal after you eat there.',
  },
  {
    icon: 'settings-outline',
    title: 'Make it yours',
    body: 'The gear icon in Settings has appearance, travel method, and a full help guide whenever you need it.',
  },
];

/**
 * First-launch walkthrough - shown once automatically for a brand new
 * install (App.js gates this on storage.js's loadOnboardingSeen), then
 * never again unless the user unchecks "Don't show this again" before
 * dismissing (in which case it's left unseen and shows again next open -
 * user request: "provide a check box... so they can turn it off", meaning
 * the box is what actually grants the "never show again" behavior, not an
 * implicit side effect of dismissing).
 */
export default function OnboardingOverlay({ visible, onDismiss }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const reset = () => { setStep(0); setDontShowAgain(true); };
  const finish = () => { onDismiss(dontShowAgain); reset(); };
  const next = () => (isLast ? finish() : setStep((s) => s + 1));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={finish}>
      <View style={styles.backdrop}>
        <Pressable style={styles.skipBtn} onPress={finish} hitSlop={10}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>

        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Ionicons name={current.icon} size={36} color={colors.textDark} />
          </View>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>

          <View style={styles.dotsRow}>
            {STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          {isLast && (
            <Pressable style={styles.checkboxRow} onPress={() => setDontShowAgain((v) => !v)} hitSlop={6}>
              <Ionicons
                name={dontShowAgain ? 'checkbox' : 'square-outline'}
                size={20}
                color={colors.accent}
              />
              <Text style={styles.checkboxLabel}>Don't show this again</Text>
            </Pressable>
          )}

          <Pressable style={styles.nextBtn} onPress={next}>
            <Text style={styles.nextBtnText}>{isLast ? 'Get Started' : 'Next'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  skipBtn: { position: 'absolute', top: 60, right: 24, padding: 8 },
  skipText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  card: { alignItems: 'center', width: '100%', maxWidth: 360 },
  iconCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: 24, ...neonSelected(colors),
  },
  title: { color: colors.textLight, fontSize: 22, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  dotsRow: { flexDirection: 'row', marginBottom: 24 },
  dot: {
    width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.cardAlt, marginHorizontal: 4,
  },
  dotActive: { backgroundColor: colors.accent, width: 20 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  checkboxLabel: { color: colors.textMuted, fontSize: 13, marginLeft: 8 },
  nextBtn: {
    backgroundColor: colors.accent, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 48,
    ...buttonDepth,
  },
  nextBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 15 },
});
