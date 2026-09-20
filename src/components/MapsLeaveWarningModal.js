import React, { useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';

/**
 * Confirms before actually leaving the app for the device's Maps app - a
 * friend's report: "it surprised them that it was taking them to their maps
 * app." Generic "Maps" wording rather than trying to name the exact app
 * that'll open (Google Maps, Apple Maps, whatever else is set as default) -
 * there's no reliable cross-platform way to know that in advance, and
 * "Maps" reads fine regardless of which one it actually is.
 *
 * Tapping the backdrop counts as Cancel (voids the action, same as tapping
 * "Stay here") - onRequestClose (the Android back button) does too. The
 * "Don't ask me again" checkbox only takes effect if the user actually
 * proceeds - unchecked-then-cancelled leaves the preference untouched, so
 * backing out of this dialog never silently changes a setting.
 */
export default function MapsLeaveWarningModal({ visible, onConfirm, onCancel }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleConfirm = () => {
    onConfirm(dontAskAgain);
    setDontAskAgain(false);
  };
  const handleCancel = () => {
    onCancel();
    setDontAskAgain(false);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleCancel}>
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        {/* Swallows the tap so pressing the sheet itself doesn't also
            trigger the backdrop's cancel behavior underneath it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Ionicons name="navigate-circle-outline" size={36} color={colors.accent} style={{ marginBottom: 10 }} />
          <Text style={styles.title}>Leaving Nomnom</Text>
          <Text style={styles.body}>This will open your Maps app to start directions. Want to continue?</Text>

          <Pressable style={styles.checkRow} onPress={() => setDontAskAgain((v) => !v)} hitSlop={6}>
            <Ionicons name={dontAskAgain ? 'checkbox' : 'square-outline'} size={20} color={dontAskAgain ? colors.accent : colors.textMuted} />
            <Text style={styles.checkText}>Don't ask me again</Text>
          </Pressable>

          <View style={styles.buttonRow}>
            <Pressable style={styles.stayBtn} onPress={handleCancel}>
              <Text style={styles.stayText}>Stay here</Text>
            </Pressable>
            <Pressable style={styles.goBtn} onPress={handleConfirm}>
              <Text style={styles.goText}>Continue to Maps</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sheet: {
    backgroundColor: colors.background, borderRadius: 24, padding: 22, width: '100%', maxWidth: 340,
    alignItems: 'center', ...buttonDepth, elevation: 20,
  },
  title: { color: colors.textLight, fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  body: { color: colors.textMuted, fontSize: 13.5, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 18 },
  checkText: { color: colors.textMuted, fontSize: 13, marginLeft: 8 },
  buttonRow: { flexDirection: 'row', width: '100%', gap: 10 },
  stayBtn: { flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.cardAlt },
  stayText: { color: colors.textLight, fontWeight: '700', fontSize: 13.5 },
  goBtn: { flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.accent, ...buttonDepth },
  goText: { color: colors.textDark, fontWeight: '700', fontSize: 13.5 },
});
