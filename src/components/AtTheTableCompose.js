import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, ActivityIndicator,
  Alert, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { searchNearbyByKeyword } from '../api/places';
import { loadAtTheTableDraft, saveAtTheTableDraft, clearAtTheTableDraft } from '../storage';
import PlaceSearchBar from './PlaceSearchBar';
import MomentsEditor, { newMoment } from './MomentsEditor';

// Kept short and low-key on purpose (user request) - occasion is a small
// side dropdown, not a labeled field everyone has to look at and decide to
// skip. Ends in "Custom..." for anything not on this short list.
const OCCASION_PRESETS = ['Date Night', 'Anniversary', 'Celebration', 'First Time Here', 'Catching Up', 'Custom...'];

/**
 * "At the Table" - quick capture while still at the meal: who/where (via
 * geolocation or a manual search, same PlaceSearchBar the rest of the app
 * uses), an optional occasion label, and one or more "moments" - a leading
 * text-only note, then a photo can be added to it (or a fresh moment
 * started once that one already has a photo) - user request: "note only
 * with an add option, then a photo... text stays at the top."
 *
 * Autosaves to a single local draft (storage.js's AtTheTableDraft) on every
 * change, restored on mount - closing and reopening the app resumes exactly
 * where it left off, since nothing can actually stay open once the app
 * itself closes (user request, see the conversation this shipped from).
 *
 * Where/who is one persistent search bar with a location icon at its end
 * (PlaceSearchBar's trailingIcon), not two mutually-exclusive modes to
 * switch between - a "Use my location" button that swapped out for a
 * separate manual-search view read as "weird switching back and forth"
 * (user request - same merged bar for both entry paths: the Mine tab's +
 * button and opening At the Table directly).
 */
export default function AtTheTableCompose({ location, travelType, onSave }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [loaded, setLoaded] = useState(false);
  const [spot, setSpot] = useState(null);
  const [occasion, setOccasion] = useState('');
  const [moments, setMoments] = useState([newMoment()]);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showOccasionMenu, setShowOccasionMenu] = useState(false);
  const [typingOccasion, setTypingOccasion] = useState(false);

  useEffect(() => {
    (async () => {
      const draft = await loadAtTheTableDraft();
      if (draft) {
        setSpot(draft.spot || null);
        setOccasion(draft.occasion || '');
        setMoments(draft.moments?.length > 0 ? draft.moments : [newMoment()]);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveAtTheTableDraft({ spot, occasion, moments, updatedAt: Date.now() });
  }, [loaded, spot, occasion, moments]);

  const findNearestSpot = async () => {
    if (!location) {
      Alert.alert('Still locating you', 'Hang tight a second and try again.');
      return;
    }
    setLocating(true);
    // Tight radius - "where I'm standing right now," not a general nearby
    // search, so this should resolve to the one place you're actually at.
    const results = await searchNearbyByKeyword(location, travelType, 'restaurant', {
      radiusMiles: 0.15,
      closestOnly: true,
    });
    setLocating(false);
    if (results.length === 0) {
      Alert.alert("Couldn't find it", 'Nothing matched nearby - try searching by name instead.');
      return;
    }
    setSpot(results[0]);
  };

  const resetForm = () => {
    setSpot(null);
    setOccasion('');
    setMoments([newMoment()]);
    setShowOccasionMenu(false);
    setTypingOccasion(false);
  };

  const canSave = !!spot && moments.some((m) => m.text.trim() || m.photoUri);

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    await onSave({
      spot,
      occasion: occasion.trim(),
      moments: moments.filter((m) => m.text.trim() || m.photoUri),
    });
    await clearAtTheTableDraft();
    resetForm();
    setSaving(false);
  };

  const handleDiscard = () => {
    Alert.alert('Discard this note?', 'Nothing will be saved.', [
      { text: 'Keep writing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await clearAtTheTableDraft();
          resetForm();
        },
      },
    ]);
  };

  if (!loaded) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;

  return (
    // behavior="padding" (iOS only, matching every other KeyboardAvoidingView
    // in this codebase) - this screen sits directly inside JournalOverlay's
    // own full-screen overlayScreen with no extra offset wrapping it, so
    // (unlike the deep-nesting bug documented on ReportBugModal/DetailModal)
    // there's no bad parent-frame math risk here - still needed regardless,
    // since without ANY KeyboardAvoidingView the keyboard just covers
    // whatever's scrolled low enough (user report).
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.wrap} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
      <View style={styles.whereHeaderRow}>
        <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>Where are you?</Text>
        {/* Occasion lives here, off to the side, rather than its own
            always-visible labeled field - a small tag with nothing chosen
            yet shouldn't read as something left undone (user request). */}
        {occasion && !typingOccasion ? (
          <Pressable style={styles.occasionChip} onPress={() => setOccasion('')}>
            <Text style={styles.occasionChipText} numberOfLines={1}>{occasion}</Text>
            <Ionicons name="close" size={12} color={colors.textDark} style={{ marginLeft: 4 }} />
          </Pressable>
        ) : (
          <Pressable onPress={() => setShowOccasionMenu((v) => !v)} hitSlop={8}>
            <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      {showOccasionMenu && (
        <View style={styles.occasionMenu}>
          {OCCASION_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              style={styles.occasionMenuItem}
              onPress={() => {
                setShowOccasionMenu(false);
                if (preset === 'Custom...') {
                  setOccasion('');
                  setTypingOccasion(true);
                } else {
                  setOccasion(preset);
                }
              }}
            >
              <Text style={styles.occasionMenuItemText}>{preset}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {typingOccasion && (
        <TextInput
          style={styles.occasionInput}
          value={occasion}
          onChangeText={setOccasion}
          placeholder="Type an occasion..."
          placeholderTextColor={colors.textMuted}
          autoFocus
          maxLength={40}
          onBlur={() => setTypingOccasion(false)}
          onSubmitEditing={() => setTypingOccasion(false)}
        />
      )}

      {spot ? (
        <View style={styles.spotRow}>
          <Ionicons name="location" size={16} color={colors.accent} />
          <Text style={styles.spotName} numberOfLines={1}>{spot.name}</Text>
          <Pressable onPress={() => setSpot(null)} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <PlaceSearchBar
          placeholder="Search for this restaurant..."
          onSelect={setSpot}
          trailingIcon="locate"
          onTrailingPress={findNearestSpot}
          trailingLoading={locating}
        />
      )}

      <Text style={styles.label}>Your note</Text>
      <MomentsEditor moments={moments} onChangeMoments={setMoments} />

      <View style={styles.footerRow}>
        <Pressable onPress={handleDiscard} style={styles.discardBtn}>
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={!canSave || saving}
          style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.4 }]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.textDark} />
          ) : (
            <Text style={styles.saveBtnText}>Save to Journal</Text>
          )}
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20 },
  label: { color: colors.accent, fontWeight: 'bold', fontSize: 12, letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  whereHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  occasionChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 150,
  },
  occasionChipText: { color: colors.textDark, fontSize: 11, fontWeight: '700' },
  occasionMenu: { backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  occasionMenuItem: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.cardAlt },
  occasionMenuItemText: { color: colors.textLight, fontSize: 13 },
  spotRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
  },
  spotName: { flex: 1, color: colors.textLight, fontSize: 14, fontWeight: '600', marginLeft: 8, marginRight: 8 },
  occasionInput: {
    backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
    color: colors.textLight, fontSize: 14,
  },
  footerRow: { flexDirection: 'row', marginTop: 24 },
  discardBtn: { paddingVertical: 12, paddingHorizontal: 18 },
  discardText: { color: colors.danger, fontWeight: 'bold', fontSize: 14 },
  saveBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 12, alignItems: 'center', ...buttonDepth },
  saveBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 14 },
});
