import React, { useState } from 'react';
import { Modal, View, Text, Pressable, Image, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { neonSelected, buttonDepth } from '../constants';
import { joinParts } from '../utils/format';
import SlidableSegmented from './SlidableSegmented';
import PlaceSearchBar from './PlaceSearchBar';

// Which source tabs to offer, per target mode - deliberately excludes
// whichever list IS the target (browsing "Try Later" as a source while
// adding TO Try Later would just be circular).
const SOURCE_TABS = {
  favorites: [
    { value: 'tryLater', label: 'Try Later' },
    { value: 'history', label: 'History' },
    { value: 'reviewed', label: 'Journal' },
  ],
  tryLater: [
    { value: 'favorites', label: 'Favorites' },
    { value: 'history', label: 'History' },
    { value: 'reviewed', label: 'Journal' },
  ],
};

/**
 * Add-by-search, shared by both the Favorites and Try Later screens (user
 * request - Try Later had no way to add a spot that was never surfaced by a
 * spin, e.g. one a friend just mentioned, without ALSO marking it a
 * favorite first, which was the only add-by-search flow that existed).
 * `mode` picks which list this instance targets: search results and every
 * row's toggle both act on `onToggle` (the matching list's own bidirectional
 * toggle - App.js's toggleFavorite/toggleTryLater), and the OTHER three
 * lists (favorites/tryLater minus whichever is the target, plus history and
 * the food journal) are all still browsable as quick-pick sources.
 */
export default function AddSpotModal({
  visible, onClose, mode, onToggle, favorites, tryLater, history, recentlyReviewed,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const tabs = SOURCE_TABS[mode];
  const [tab, setTab] = useState(tabs[0].value);

  const sourceMap = { favorites, tryLater, history, reviewed: recentlyReviewed };
  const emptyMap = {
    favorites: 'No favorites yet.',
    tryLater: 'Nothing on your try list yet.',
    history: 'Nothing seen yet.',
    reviewed: 'Nothing in your Journal yet.',
  };
  const list = sourceMap[tab] || [];
  const targetList = mode === 'favorites' ? favorites : tryLater;
  const icon = mode === 'favorites' ? 'heart' : 'bookmark';
  const iconOutline = mode === 'favorites' ? 'heart-outline' : 'bookmark-outline';
  const iconColor = mode === 'favorites' ? colors.danger : colors.gold;
  const title = mode === 'favorites' ? 'Add to Favorites' : 'Add to Try Later';

  // Closes right after toggling, instead of staying open - otherwise there
  // was no visible confirmation a search result actually got added (user
  // report: "tough to tell that the new restaurant just got added"). This
  // way the user lands straight back on the list they were adding to and
  // can see the new row appear.
  const handleToggle = (spot) => {
    onToggle(spot);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} style={{ padding: 6 }} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.accent} />
            </Pressable>
          </View>

          <PlaceSearchBar placeholder="Search for a restaurant..." onSelect={handleToggle} />

          <SlidableSegmented
            options={tabs}
            value={tab}
            onChange={setTab}
            styles={{
              segmented: styles.tabRow,
              segment: styles.tabBtn,
              segmentActive: styles.tabBtnActive,
              segmentText: styles.tabText,
              segmentTextActive: styles.tabTextActive,
            }}
          />

          <ScrollView style={styles.list}>
            {list.length === 0 ? (
              <Text style={styles.emptyText}>{emptyMap[tab]}</Text>
            ) : (
              list.map((spot, i) => {
                const isOnTarget = targetList.some((s) => s.id === spot.id);
                return (
                  <Pressable
                    key={`${spot.id}-${i}`}
                    style={styles.row}
                    onPress={() => handleToggle(spot)}
                  >
                    {spot.photoUrl ? (
                      <Image source={{ uri: spot.photoUrl }} style={styles.rowImage} />
                    ) : (
                      <View style={styles.rowImagePlaceholder}>
                        <Ionicons name="restaurant" size={16} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{spot.name}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {joinParts([`⭐ ${spot.rating}`, spot.type])}
                      </Text>
                    </View>
                    <Ionicons name={isOnTarget ? icon : iconOutline} size={20} color={iconColor} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '80%',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: colors.textLight, fontSize: 20, fontWeight: 'bold' },
  tabRow: { flexDirection: 'row', backgroundColor: '#333', borderRadius: 22, padding: 4, marginTop: 6, marginBottom: 12 },
  // borderWidth pinned at rest (transparent) so switching tabs only ever
  // changes color, never size - same fix used for every other segmented
  // toggle in this app (a sudden 0->2px border on a flex:1 sibling visibly
  // nudges the row).
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  tabBtnActive: { backgroundColor: colors.accent, ...neonSelected(colors) },
  tabText: { color: colors.textLight, fontWeight: 'bold', fontSize: 13 },
  tabTextActive: { color: colors.textDark },
  list: { maxHeight: 320 },
  emptyText: { color: colors.textMuted, fontStyle: 'italic', fontSize: 13, textAlign: 'center', marginTop: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 12, padding: 10, marginBottom: 8, ...buttonDepth,
  },
  rowImage: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
  rowImagePlaceholder: {
    width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: '#555',
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { color: colors.textLight, fontSize: 14, fontWeight: '600' },
  rowSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
});
