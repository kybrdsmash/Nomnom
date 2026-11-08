import React, { useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, StyleSheet, Share, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth, JOIN_LINK_BASE_URL } from '../constants';
import { ensureSignedIn } from '../api/firebase';
import { getOrCreateFriendCode, lookupFriendByCode } from '../api/friendCode';

// The site that already serves the join links - used as the "get the app"
// link in invites (the join path is just one page on it).
const APP_SITE_URL = JOIN_LINK_BASE_URL.replace(/\/join$/, '');

/**
 * "Add a friend" - replaces the old Share code tile + "Have a code? Join a
 * session" link on the Feast menu with one place for everything about
 * getting someone into your friends list:
 *
 * 1. Invite someone who may not have the app: opens the OS share sheet with
 *    a message carrying the download link and YOUR permanent friend code
 *    (friendCode.js). The share sheet is what lets you pick a contact or
 *    chat and send it as a direct message - no contacts permission or new
 *    native dependency needed on our side.
 * 2. Add someone who sent you THEIR friend code (6 characters).
 * 3. Join a live session code (4 characters) - the old link's job, kept
 *    here because it is still how the guest side of a session starts.
 */
export default function AddFriendModal({ visible, onClose, displayName, myUid, onAddFriend, onJoinSession }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [busy, setBusy] = useState(false);
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [sessionCodeInput, setSessionCodeInput] = useState('');
  const [message, setMessage] = useState(null); // { text, ok }

  const close = () => {
    setFriendCodeInput('');
    setSessionCodeInput('');
    setMessage(null);
    onClose();
  };

  const sendInvite = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const uid = await ensureSignedIn();
      const code = await getOrCreateFriendCode(uid, displayName);
      await Share.share({
        message:
          `${displayName ? `${displayName} here - ` : ''}come eat with me on Nomnom! ` +
          `Get the app: ${APP_SITE_URL}\nThen add me with friend code ${code}.`,
      });
    } catch (e) {
      setMessage({ text: "Couldn't prepare your invite. Check your connection.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  const addByCode = async () => {
    setBusy(true);
    setMessage(null);
    const found = await lookupFriendByCode(friendCodeInput);
    setBusy(false);
    if (!found) {
      setMessage({ text: 'No one has that friend code.', ok: false });
      return;
    }
    if (found.uid === myUid) {
      setMessage({ text: "That's your own code.", ok: false });
      return;
    }
    onAddFriend({ uid: found.uid, name: found.name || 'Friend' });
    setMessage({ text: `Added ${found.name || 'your friend'}!`, ok: true });
    setFriendCodeInput('');
  };

  const joinCode = () => {
    const code = sessionCodeInput.trim();
    close();
    onJoinSession(code);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Add a friend</Text>
            <Pressable onPress={close} style={{ padding: 6 }}>
              <Ionicons name="close" size={26} color={colors.accent} />
            </Pressable>
          </View>

          <Pressable style={styles.primaryBtn} onPress={sendInvite} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.textDark} />
            ) : (
              <>
                <Ionicons name="paper-plane" size={17} color={colors.textDark} />
                <Text style={styles.primaryBtnText}>Send an invite</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.hint}>
            Pick a contact or chat - they get a link to download Nomnom plus your friend code.
          </Text>

          <Text style={styles.sectionLabel}>Got a friend's code?</Text>
          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeInput}
              value={friendCodeInput}
              onChangeText={(t) => setFriendCodeInput(t.toUpperCase())}
              placeholder="FRIEND CODE"
              placeholderTextColor="#666"
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.smallBtn, (friendCodeInput.length !== 6 || busy) && { opacity: 0.4 }]}
              disabled={friendCodeInput.length !== 6 || busy}
              onPress={addByCode}
            >
              <Text style={styles.smallBtnText}>Add</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionLabel}>Joining a live session?</Text>
          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeInput}
              value={sessionCodeInput}
              onChangeText={(t) => setSessionCodeInput(t.toUpperCase())}
              placeholder="SESSION CODE"
              placeholderTextColor="#666"
              maxLength={4}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.smallBtn, sessionCodeInput.length !== 4 && { opacity: 0.4 }]}
              disabled={sessionCodeInput.length !== 4}
              onPress={joinCode}
            >
              <Text style={styles.smallBtnText}>Join</Text>
            </Pressable>
          </View>

          {!!message && (
            <Text style={[styles.message, { color: message.ok ? colors.accent : colors.danger }]}>{message.text}</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { color: colors.textLight, fontSize: 20, fontWeight: 'bold' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.accent, borderRadius: 25, paddingVertical: 14, ...buttonDepth,
  },
  primaryBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 15 },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 },
  sectionLabel: { color: colors.accent, fontSize: 13, fontWeight: 'bold', letterSpacing: 1, marginTop: 22, marginBottom: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  codeInput: {
    flex: 1, backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11,
    color: colors.gold, fontSize: 16, fontWeight: '800', letterSpacing: 4,
  },
  smallBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 20 },
  smallBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 14 },
  message: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 16 },
});
