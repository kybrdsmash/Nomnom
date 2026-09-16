import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { submitBugReport } from '../api/bugReports';

/**
 * Its own top-level Modal (was inline inside SettingsPanel's floating,
 * absolutely-positioned panel) - that panel sits deep inside a nested,
 * offset-from-screen-bottom View, and RN's KeyboardAvoidingView computes its
 * shift using a layout frame measured relative to its immediate parent, not
 * the true screen - so nested that deep, the math silently came out wrong
 * and the keyboard kept covering the input regardless (user report,
 * confirmed against RN's own source). A Modal renders its own fresh subtree
 * at the screen root, so the same KeyboardAvoidingView behavior works
 * correctly here without that offset problem.
 */
export default function ReportBugModal({ visible, onClose, myUid, displayName }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [bugText, setBugText] = useState('');
  const [screenshotUri, setScreenshotUri] = useState(null);
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugStatus, setBugStatus] = useState('idle'); // 'idle' | 'sent' | 'error'

  useEffect(() => {
    if (!visible) return;
    setBugText('');
    setScreenshotUri(null);
    setBugStatus('idle');
  }, [visible]);

  // Picking from the library, not the camera - a bug report screenshot is
  // almost always already sitting in the photo library (the OS's own
  // screenshot shortcut), not something worth photographing off the screen.
  const pickScreenshot = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0]) return;
    setScreenshotUri(result.assets[0].uri);
  };

  const submitBug = async () => {
    if (!bugText.trim() || bugSubmitting) return;
    setBugSubmitting(true);
    const ok = await submitBugReport({ uid: myUid, description: bugText, displayName, screenshotUri });
    setBugSubmitting(false);
    if (ok) {
      setBugText('');
      setScreenshotUri(null);
      setBugStatus('sent');
    } else {
      setBugStatus('error');
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Report a Bug</Text>
            <Pressable onPress={onClose} style={{ padding: 6 }} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.accent} />
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            value={bugText}
            onChangeText={(t) => { setBugText(t); setBugStatus('idle'); }}
            placeholder="What went wrong? Be as specific as you can - what you tapped, what you expected..."
            placeholderTextColor="#777"
            multiline
            autoFocus
            maxLength={500}
          />

          {screenshotUri ? (
            <View style={styles.screenshotRow}>
              <Image source={{ uri: screenshotUri }} style={styles.screenshotThumb} />
              <Pressable onPress={() => setScreenshotUri(null)} style={styles.screenshotRemoveBtn} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.addScreenshotBtn} onPress={pickScreenshot}>
              <Ionicons name="image-outline" size={16} color={colors.accent} />
              <Text style={styles.addScreenshotText}>Add a screenshot</Text>
            </Pressable>
          )}

          <View style={styles.submitRow}>
            <Pressable
              style={[styles.submitBtn, (!bugText.trim() || bugSubmitting) && { opacity: 0.4 }]}
              disabled={!bugText.trim() || bugSubmitting}
              onPress={submitBug}
            >
              {bugSubmitting ? (
                <ActivityIndicator color={colors.textDark} size="small" />
              ) : (
                <Text style={styles.submitText}>Send</Text>
              )}
            </Pressable>
            {bugStatus === 'sent' && <Text style={styles.statusSent}>Sent - thanks!</Text>}
            {bugStatus === 'error' && <Text style={styles.statusError}>Couldn't send - try again</Text>}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: colors.background, borderRadius: 24, padding: 20,
    width: '88%', ...buttonDepth, elevation: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  title: { color: colors.textLight, fontSize: 19, fontWeight: 'bold' },
  input: {
    backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.textLight, fontSize: 14, minHeight: 110, textAlignVertical: 'top', marginBottom: 14,
  },
  addScreenshotBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    marginBottom: 14, paddingVertical: 6,
  },
  addScreenshotText: { color: colors.accent, fontSize: 13, fontWeight: '600', marginLeft: 6 },
  screenshotRow: { marginBottom: 14, alignSelf: 'flex-start' },
  screenshotThumb: { width: 90, height: 90, borderRadius: 10, backgroundColor: colors.cardAlt },
  screenshotRemoveBtn: {
    position: 'absolute', top: -8, right: -8, backgroundColor: colors.background, borderRadius: 10,
  },
  submitRow: { flexDirection: 'row', alignItems: 'center' },
  submitBtn: {
    backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 10,
    paddingHorizontal: 20, ...buttonDepth,
  },
  submitText: { color: colors.textDark, fontWeight: 'bold', fontSize: 13 },
  statusSent: { color: colors.accent, fontSize: 12, fontWeight: '600', marginLeft: 10 },
  statusError: { color: colors.danger, fontSize: 12, fontWeight: '600', marginLeft: 10 },
});
