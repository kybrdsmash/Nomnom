import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { useAudioRecorder, AudioModule, RecordingPresets, useAudioRecorderState } from 'expo-audio';
import { useTheme } from '../ThemeContext';
import { transcribeAudio } from '../api/transcribe';

export const newMoment = () => ({ id: Math.random().toString(36).slice(2), text: '', photoUri: null });

// Copies out of the picker's own (OS-evictable) cache dir, same reasoning
// throughout this codebase's other photo attachments.
async function pickPhoto(fromCamera) {
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
    : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
  if (result.canceled || !result.assets?.[0]) return null;
  const dest = new File(Paths.document, `journal-moment-photo-${Date.now()}.jpg`);
  new File(result.assets[0].uri).copy(dest);
  return dest.uri;
}

/**
 * `useAudioRecorder` creates a real native recorder object as soon as this
 * mounts (not lazily on first tap) - if expo-audio's native module isn't
 * actually available in whatever's currently running (freshly added
 * dependency, stale Metro/Expo Go cache, no rebuild yet), that constructor
 * throws during render and - without this boundary - took the ENTIRE
 * compose form down with it, since every moment renders its own MicButton
 * unconditionally (user report: crashed trying to write a journal entry at
 * all). Catching it here means voice-to-text degrades to "just not there"
 * instead of blocking text/photo entries, which don't depend on it at all.
 */
class MicButtonBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.warn('MicButton failed to initialize (voice-to-text unavailable):', error);
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

/**
 * Tap to record, tap again to stop and transcribe (OpenAI Whisper, see
 * api/transcribe.js). Its own component so each moment's text field gets an
 * independent recorder/permission state.
 */
function MicButton({ colors, onTranscribed }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [transcribing, setTranscribing] = useState(false);

  const toggleRecording = async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
      setTranscribing(true);
      const text = await transcribeAudio(recorder.uri);
      setTranscribing(false);
      if (text) onTranscribed(text);
      else Alert.alert("Couldn't hear that", 'Give it another try, or just type it.');
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone access needed', 'Turn it on in Settings to use voice notes.');
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  return (
    <Pressable onPress={toggleRecording} hitSlop={10} style={{ padding: 4 }}>
      {transcribing ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons
          name={recorderState.isRecording ? 'stop-circle' : 'mic-outline'}
          size={20}
          color={recorderState.isRecording ? colors.danger : colors.accent}
        />
      )}
    </Pressable>
  );
}

/**
 * Shared moments editor - a leading note, then any number of [photo-on-top,
 * text-below] blocks after it, each with its own mic button. Used by both
 * AtTheTableCompose (the live-at-the-meal flow) and DetailModal's own "My
 * Journal" compose box (user request: the two should be the same format,
 * not the old single-photo/single-note form DetailModal had). Fully
 * controlled - `moments`/`onChangeMoments` is the only state this owns
 * itself; the caller decides what happens to it (autosave a draft, hold it
 * in local compose state, whatever).
 *
 * Two separate "+" controls (user request), not one: Add a photo attaches
 * to whichever moment doesn't have one yet (usually the last one), or
 * starts a fresh moment if every existing one already has a photo. Add more
 * text always starts a brand-new blank moment, regardless of photo state -
 * for someone who just wants another blurb, not another picture.
 */
export default function MomentsEditor({
  moments, onChangeMoments,
  firstPlaceholder = "What are you having? How's it going?",
  morePlaceholder = 'Say more about this one...',
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const updateMomentText = (id, text) => {
    onChangeMoments(moments.map((m) => (m.id === id ? { ...m, text } : m)));
  };

  const attachPhotoTo = (momentId, uri) => {
    const target = moments.find((m) => m.id === momentId);
    if (target && !target.photoUri) {
      onChangeMoments(moments.map((m) => (m.id === momentId ? { ...m, photoUri: uri } : m)));
    } else {
      onChangeMoments([...moments, { ...newMoment(), photoUri: uri }]);
    }
  };

  const addPhoto = () => {
    const targetId = moments[moments.length - 1].id;
    Alert.alert('Add a Photo', undefined, [
      {
        text: 'Take Photo',
        onPress: async () => {
          const uri = await pickPhoto(true);
          if (uri) attachPhotoTo(targetId, uri);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const uri = await pickPhoto(false);
          if (uri) attachPhotoTo(targetId, uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const addText = () => {
    onChangeMoments([...moments, newMoment()]);
  };

  const removeMoment = (id) => {
    if (moments.length > 1) onChangeMoments(moments.filter((m) => m.id !== id));
  };

  return (
    <View>
      {moments.map((moment, i) => (
        <View key={moment.id} style={styles.momentBlock}>
          {/* Photo above its text, matching the saved-entry reel's own
              order (DetailModal's renderMomentEntry), so writing and
              reading it back look the same. */}
          {moment.photoUri && (
            <View style={styles.momentPhotoWrap}>
              <Image source={{ uri: moment.photoUri }} style={styles.momentPhoto} />
              {moments.length > 1 && (
                <Pressable style={styles.removeMomentBtn} onPress={() => removeMoment(moment.id)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={14} color="#FFF" />
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.momentInputRow}>
            <TextInput
              style={styles.momentInput}
              value={moment.text}
              onChangeText={(t) => updateMomentText(moment.id, t)}
              placeholder={i === 0 ? firstPlaceholder : morePlaceholder}
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <MicButtonBoundary>
              <MicButton
                colors={colors}
                onTranscribed={(text) => updateMomentText(moment.id, moment.text ? `${moment.text} ${text}` : text)}
              />
            </MicButtonBoundary>
            {/* A text-only moment (no photo) past the first one can also be
                removed right from its own row - the trash icon above only
                exists once a photo's attached. */}
            {i > 0 && !moment.photoUri && (
              <Pressable onPress={() => removeMoment(moment.id)} hitSlop={8} style={{ marginLeft: 4 }}>
                <Ionicons name="close-circle-outline" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        </View>
      ))}

      <View style={styles.addRow}>
        <Pressable style={styles.addBtn} onPress={addPhoto}>
          <Ionicons name="camera-outline" size={18} color={colors.accent} />
          <Text style={styles.addBtnText}>Add a photo</Text>
        </Pressable>
        <Pressable style={styles.addBtn} onPress={addText}>
          <Ionicons name="add-outline" size={18} color={colors.accent} />
          <Text style={styles.addBtnText}>Add more text</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  momentBlock: { marginBottom: 12 },
  momentInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.card,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
  },
  momentInput: { flex: 1, color: colors.textLight, fontSize: 14, minHeight: 40, marginRight: 8 },
  momentPhotoWrap: { marginBottom: 8, borderRadius: 14, overflow: 'hidden' },
  momentPhoto: { width: '100%', height: 180, backgroundColor: colors.cardAlt },
  removeMomentBtn: {
    position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12, padding: 6,
  },
  addRow: { flexDirection: 'row', marginTop: 4 },
  addBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderRadius: 16, paddingVertical: 10, marginRight: 8,
  },
  addBtnText: { color: colors.accent, fontWeight: '600', fontSize: 13, marginLeft: 6 },
});
