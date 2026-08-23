import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, TextInput, ScrollView,
  StyleSheet, Platform, Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { neonSelected } from '../constants';
import { useTheme } from '../ThemeContext';
import { sendChatMessage, setProposedTime, toggleLockIn } from '../api/friendSession';
import { shareIcsForSpot } from '../utils/ics';

/** Google Calendar's "add event" template link - no account/API key needed, just a URL. */
function buildCalendarLink(spot, proposedTimeIso) {
  const start = new Date(proposedTimeIso);
  const end = new Date(start.getTime() + 90 * 60 * 1000); // default 90-minute dinner
  const fmt = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const text = encodeURIComponent(`Nomnom: ${spot.name}`);
  const details = encodeURIComponent(`Picked together on Nomnom: ${spot.name}`);
  const location = encodeURIComponent(spot.address || `${spot.lat},${spot.lng}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(start)}/${fmt(end)}&details=${details}&location=${location}`;
}

/**
 * Friend-spin winner screen's "schedule the meal together" step: a short
 * chat for hashing out details in words, a shared proposed date/time either
 * player can set, and an "I'm in" lock each player taps once they agree -
 * only once BOTH have locked in does the calendar link appear.
 */
export default function ScheduleMealModal({ visible, onClose, session, code, myUid, spot }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [draftMessage, setDraftMessage] = useState('');
  const [pickerStage, setPickerStage] = useState(null); // null | 'date' | 'time' | 'datetime'
  const [draftDate, setDraftDate] = useState(new Date());
  const chatScrollRef = useRef(null);

  const messages = session?.chatMessages || [];

  // Jumps to the latest message whenever one arrives - from either player,
  // since `messages` comes straight off the live Firestore snapshot - and on
  // open if the chat already has history.
  useEffect(() => {
    chatScrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  if (!session) return null;
  const lockedUids = session.lockedUids || [];
  const iAmLocked = lockedUids.includes(myUid);
  const otherUid = myUid === session.hostUid ? session.guestUid : session.hostUid;
  const theyAreLocked = otherUid && lockedUids.includes(otherUid);
  const bothLocked = iAmLocked && theyAreLocked;
  const proposedDate = session.proposedTime ? new Date(session.proposedTime) : null;

  const send = () => {
    const text = draftMessage.trim();
    if (!text) return;
    setDraftMessage('');
    sendChatMessage(code, myUid, text);
  };

  const openPicker = () => {
    setDraftDate(proposedDate || new Date());
    setPickerStage(Platform.OS === 'ios' ? 'datetime' : 'date');
  };

  // Android's native picker only supports one of date/time per screen, so a
  // full date+time selection is two chained pickers; iOS handles both at once.
  const handlePickerChange = (event, selected) => {
    const stage = pickerStage;
    if (Platform.OS === 'android') setPickerStage(null);
    if (event.type === 'dismissed' || !selected) {
      setPickerStage(null);
      return;
    }
    if (Platform.OS === 'ios') {
      setProposedTime(code, selected.toISOString());
      setPickerStage(null);
      return;
    }
    if (stage === 'date') {
      setDraftDate(selected);
      setPickerStage('time');
    } else if (stage === 'time') {
      const combined = new Date(draftDate);
      combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setProposedTime(code, combined.toISOString());
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Schedule the meal</Text>
            <Pressable onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={26} color={colors.accent} />
            </Pressable>
          </View>

          <Pressable style={styles.timeRow} onPress={openPicker}>
            <Ionicons name="calendar" size={20} color={colors.accent} />
            <Text style={styles.timeText}>
              {proposedDate
                ? proposedDate.toLocaleString(undefined, {
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  })
                : 'Pick a date & time together'}
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

          {proposedDate && (
            <View style={styles.lockRow}>
              <Pressable
                style={[styles.lockBtn, iAmLocked && styles.lockBtnActive]}
                onPress={() => toggleLockIn(code, session, myUid)}
              >
                <Ionicons name={iAmLocked ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={iAmLocked ? colors.textDark : colors.accent} />
                <Text style={[styles.lockText, iAmLocked && styles.lockTextActive]}>
                  {iAmLocked ? "You're in" : "I'm in"}
                </Text>
              </Pressable>
              <Text style={styles.otherStatus}>
                {theyAreLocked ? 'Your friend is in ✅' : 'Waiting on your friend…'}
              </Text>
            </View>
          )}

          {bothLocked && proposedDate && (
            <>
              {/* Real .ics file handed to the OS share sheet - works on both
                  iOS (Apple Calendar) and Android natively, unlike the
                  Google Calendar web link below which only really feels
                  "automatic" on Android/Chrome (user request: "this needs
                  to work on iPhones and Androids"). */}
              <Pressable
                style={styles.calendarBtn}
                onPress={() => shareIcsForSpot(spot, session.proposedTime).catch(() => {})}
              >
                <Ionicons name="calendar" size={18} color={colors.textDark} />
                <Text style={styles.calendarBtnText}>Add to Calendar</Text>
              </Pressable>
              <Pressable onPress={() => Linking.openURL(buildCalendarLink(spot, session.proposedTime))}>
                <Text style={styles.altCalendarLink}>or use Google Calendar</Text>
              </Pressable>
            </>
          )}

          <ScrollView
            ref={chatScrollRef}
            style={styles.chatScroll}
            onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 && (
              <Text style={styles.emptyChat}>Say hi and figure out a time!</Text>
            )}
            {messages.map((m, i) => (
              <View
                key={i}
                style={[styles.bubble, m.uid === myUid ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                <Text style={m.uid === myUid ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{m.text}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draftMessage}
              onChangeText={setDraftMessage}
              placeholder="Message your friend…"
              placeholderTextColor="#777"
              onSubmitEditing={send}
              returnKeyType="send"
            />
            <Pressable onPress={send} style={styles.sendBtn}>
              <Ionicons name="send" size={18} color={colors.textDark} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, height: '75%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: colors.textLight, fontSize: 20, fontWeight: 'bold' },
  timeRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10 },
  timeText: { color: colors.textLight, fontSize: 14, fontWeight: '600', marginLeft: 10, flex: 1 },
  timeEdit: { color: colors.accent, fontWeight: 'bold', fontSize: 13 },
  lockRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  lockBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 2, borderColor: colors.accent, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 12 },
  lockBtnActive: { backgroundColor: colors.accent },
  lockText: { color: colors.accent, fontWeight: 'bold', marginLeft: 6, fontSize: 13 },
  lockTextActive: { color: colors.textDark },
  otherStatus: { color: colors.textMuted, fontSize: 13, flexShrink: 1 },
  calendarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, borderRadius: 20, paddingVertical: 12, marginBottom: 12, ...neonSelected(colors) },
  calendarBtnText: { color: colors.textDark, fontWeight: 'bold', marginLeft: 8, fontSize: 15 },
  altCalendarLink: { color: colors.textMuted, fontSize: 12, textAlign: 'center', textDecorationLine: 'underline', marginBottom: 12 },
  chatScroll: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 10, marginBottom: 10 },
  emptyChat: { color: colors.textMuted, textAlign: 'center', marginTop: 20, fontStyle: 'italic' },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 },
  bubbleMine: { backgroundColor: colors.accent, alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: colors.cardAlt, alignSelf: 'flex-start' },
  bubbleTextMine: { color: colors.textDark, fontSize: 14 },
  bubbleTextTheirs: { color: colors.textLight, fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: colors.textLight, marginRight: 10 },
  sendBtn: { backgroundColor: colors.accent, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
