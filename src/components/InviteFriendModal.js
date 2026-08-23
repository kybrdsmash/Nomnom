import React, { useState } from 'react';
import { Modal, View, Text, Pressable, Image, ScrollView, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { neonSelected, buttonDepth } from '../constants';
import { useTheme } from '../ThemeContext';
import { createDirectInvite, sendPing } from '../api/friendSession';
import { shareIcsForSpot } from '../utils/ics';

/**
 * "Invite a friend to THIS spot" - a one-way share (a specific place + a
 * proposed date/time) to one friend, distinct from "Ping" (which starts a
 * whole live joint elimination session). Opened from either ResultCard's
 * share icon (an already-known result) or the Feast with Friends "Quick
 * Invite" search row (a freshly searched-for spot) - both just need a
 * `spot`, so this modal doesn't care which one it came from.
 *
 * Sends via createDirectInvite (see friendSession.js) - creates the same
 * sessions/{code} doc shape a normal bracket uses, just pre-filled straight
 * to 'done' with this one spot already the winner, then pings the chosen
 * friend the same way starting a session does. The recipient lands on the
 * exact same ResultCard/ScheduleMealModal winner screen this app already
 * has, with nothing new needed on that end.
 */
export default function InviteFriendModal({ visible, onClose, spot, location, displayName, friends }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [pickerStage, setPickerStage] = useState(null); // null | 'date' | 'time' | 'datetime'
  const [draftDate, setDraftDate] = useState(new Date());
  const [proposedDate, setProposedDate] = useState(null);
  const [selectedFriendUid, setSelectedFriendUid] = useState(null);
  const [sending, setSending] = useState(false);
  const [sentCode, setSentCode] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const reset = () => {
    setPickerStage(null);
    setProposedDate(null);
    setSelectedFriendUid(null);
    setSending(false);
    setSentCode(null);
    setErrorMsg('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const openPicker = () => {
    setDraftDate(proposedDate || new Date());
    setPickerStage(Platform.OS === 'ios' ? 'datetime' : 'date');
  };

  // Android's native picker only supports one of date/time per screen, so a
  // full date+time selection is two chained pickers; iOS handles both at
  // once. Mirrors ScheduleMealModal's identical handling.
  const handlePickerChange = (event, selected) => {
    const stage = pickerStage;
    if (Platform.OS === 'android') setPickerStage(null);
    if (event.type === 'dismissed' || !selected) {
      setPickerStage(null);
      return;
    }
    if (Platform.OS === 'ios') {
      setProposedDate(selected);
      setPickerStage(null);
      return;
    }
    if (stage === 'date') {
      setDraftDate(selected);
      setPickerStage('time');
    } else if (stage === 'time') {
      const combined = new Date(draftDate);
      combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setProposedDate(combined);
    }
  };

  const canSend = !!spot && !!proposedDate && !!selectedFriendUid && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setErrorMsg('');
    try {
      const friend = friends.find((f) => f.uid === selectedFriendUid);
      const { code, uid } = await createDirectInvite(location, displayName, spot, proposedDate.toISOString());
      await sendPing(friend.uid, uid, displayName, code);
      setSentCode(code);
    } catch (e) {
      setErrorMsg('Could not send the invite. Check your connection.');
    } finally {
      setSending(false);
    }
  };

  if (!spot) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Invite a friend</Text>
            <Pressable onPress={close} style={{ padding: 6 }}>
              <Ionicons name="close" size={26} color={colors.accent} />
            </Pressable>
          </View>

          {sentCode ? (
            <View style={styles.sentState}>
              <Ionicons name="checkmark-circle" size={48} color={colors.accent} />
              <Text style={styles.sentText}>Invite sent!</Text>
              <Text style={styles.sentSub}>
                They'll see it next time they open Nomnom.
              </Text>
              <Pressable
                style={styles.calendarBtn}
                onPress={() => shareIcsForSpot(spot, proposedDate.toISOString()).catch(() => {})}
              >
                <Ionicons name="calendar" size={18} color={colors.textDark} />
                <Text style={styles.calendarBtnText}>Add to your own calendar too</Text>
              </Pressable>
              <Pressable style={styles.doneBtn} onPress={close}>
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.spotRow}>
                {spot.photoUrl ? (
                  <Image source={{ uri: spot.photoUrl }} style={styles.spotImage} />
                ) : (
                  <View style={styles.spotImagePlaceholder}>
                    <Ionicons name="restaurant" size={20} color={colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.spotName} numberOfLines={1}>{spot.name}</Text>
                  {!!spot.distance && <Text style={styles.spotSub} numberOfLines={1}>{spot.distance}</Text>}
                </View>
              </View>

              <Pressable style={styles.timeRow} onPress={openPicker}>
                <Ionicons name="calendar" size={20} color={colors.accent} />
                <Text style={styles.timeText}>
                  {proposedDate
                    ? proposedDate.toLocaleString(undefined, {
                        weekday: 'short', month: 'short', day: 'numeric',
                        hour: 'numeric', minute: '2-digit',
                      })
                    : 'Pick a date & time'}
                </Text>
                <Text style={styles.timeEdit}>{proposedDate ? 'Change' : 'Set'}</Text>
              </Pressable>

              {pickerStage && (
                <DateTimePicker
                  value={draftDate}
                  mode={pickerStage === 'time' ? 'time' : pickerStage === 'datetime' ? 'datetime' : 'date'}
                  display="default"
                  onChange={handlePickerChange}
                />
              )}

              <Text style={styles.sectionLabel}>Send to</Text>
              {friends.length === 0 ? (
                <Text style={styles.emptyText}>
                  No friends yet - spin with someone once first so they show up here.
                </Text>
              ) : (
                <ScrollView style={styles.friendScroll}>
                  {friends.map((f) => {
                    const active = selectedFriendUid === f.uid;
                    return (
                      <Pressable
                        key={f.uid}
                        style={[styles.friendRow, active && styles.friendRowActive]}
                        onPress={() => setSelectedFriendUid(f.uid)}
                      >
                        <View style={styles.friendAvatar}>
                          <Text style={styles.friendAvatarText}>{(f.name || '?')[0].toUpperCase()}</Text>
                        </View>
                        <Text style={styles.friendName} numberOfLines={1}>{f.name || 'Friend'}</Text>
                        {active && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}

              {!!errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

              <Pressable
                style={[styles.sendBtn, !canSend && { opacity: 0.4 }]}
                disabled={!canSend}
                onPress={send}
              >
                <Ionicons name="paper-plane" size={18} color={colors.textDark} />
                <Text style={styles.sendBtnText}>{sending ? 'Sending…' : 'Send Invite'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: colors.textLight, fontSize: 20, fontWeight: 'bold' },
  spotRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 10, marginBottom: 14 },
  spotImage: { width: 44, height: 44, borderRadius: 22, marginRight: 12 },
  spotImagePlaceholder: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' },
  spotName: { color: colors.textLight, fontSize: 15, fontWeight: 'bold' },
  spotSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 14 },
  timeText: { color: colors.textLight, fontSize: 14, fontWeight: '600', marginLeft: 10, flex: 1 },
  timeEdit: { color: colors.accent, fontWeight: 'bold', fontSize: 13 },
  sectionLabel: { color: colors.accent, fontSize: 13, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8 },
  emptyText: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginBottom: 14 },
  friendScroll: { maxHeight: 180, marginBottom: 14 },
  friendRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 10, marginBottom: 8, borderWidth: 2, borderColor: 'transparent' },
  friendRowActive: { borderColor: colors.accent },
  friendAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  friendAvatarText: { color: colors.textDark, fontWeight: 'bold', fontSize: 14 },
  friendName: { flex: 1, color: colors.textLight, fontSize: 14, fontWeight: '600' },
  errorText: { color: colors.danger, fontSize: 13, marginBottom: 10, textAlign: 'center' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 25, paddingVertical: 14, ...buttonDepth },
  sendBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 15, marginLeft: 8 },
  sentState: { alignItems: 'center', paddingVertical: 20 },
  sentText: { color: colors.textLight, fontSize: 18, fontWeight: 'bold', marginTop: 12 },
  sentSub: { color: colors.textMuted, fontSize: 13, marginTop: 4, marginBottom: 20, textAlign: 'center' },
  calendarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 18, marginBottom: 12, ...neonSelected(colors) },
  calendarBtnText: { color: colors.textDark, fontWeight: 'bold', marginLeft: 8, fontSize: 14 },
  doneBtn: { paddingVertical: 10, paddingHorizontal: 18 },
  doneBtnText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
});
