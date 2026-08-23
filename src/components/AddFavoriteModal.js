import React, { useState } from 'react';
import { Modal, View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { neonSelected, buttonDepth } from '../constants';
import { joinParts } from '../utils/format';
import SlidableSegmented from './SlidableSegmented';
import PlaceSearchBar from './PlaceSearchBar';

/**
 * Everything needed to add a new favorite lives behind the "+" button on
 * the Favorites screen (moved out of an always-visible search bar - user
 * request): search for any restaurant by name, or pick straight from
 * spots already sitting in Try Later, History, or your food journal
 * ("Reviewed"), each shown with a heart that's filled if it's already a
 * favorite so this doubles as a quick toggle. `onToggleFavorite` is the
 * same bidirectional toggle (App.js's toggleFavorite) used everywhere else
 * favoriting happens.
 */
export default function AddFavoriteModal({
  visible, onClose, onToggleFavorite, favorites, tryLater, history, recentlyReviewed,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [tab, setTab] = useState('tryLater');

  const sourceMap = { tryLater, history, reviewed: recentlyReviewed };
  const emptyMap = {
    tryLater: 'Nothing on your try list yet.',
    history: 'Nothing seen yet.',
    reviewed: 'No reviews logged yet.',
  };
  const list = sourceMap[tab] || [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Add to Favorites</Text>
            <Pressable onPress={onClose} style={{ padding: 6 }} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.accent} />
            </Pressable>
          </View>

          <PlaceSearchBar placeholder="Search for a restaurant..." onSelect={onToggleFavorite} />

          <SlidableSegmented
            options={[
              { value: 'tryLater', label: 'Try Later' },
              { value: 'history', label: 'History' },
              { value: 'reviewed', label: 'Reviewed' },
            ]}
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
                const isFav = favorites.some((f) => f.id === spot.id);
                return (
                  <Pressable
                    key={`${spot.id}-${i}`}
                    style={styles.row}
                    onPress={() => onToggleFavorite(spot)}
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
                    <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={colors.danger} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
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
