import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { neonSelected, buttonDepth } from '../constants';
import { isFirebaseConfigured } from '../api/firebase';
import { fetchFriendJournal } from '../api/journal';
import { groupByCity } from '../utils/location';
import SlidableSegmented from './SlidableSegmented';
import PlaceSearchBar from './PlaceSearchBar';

function relativeTime(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * "My Reviews" - browse the whole food journal, off the hamburger menu.
 * Mine: every place you've left feedback on, most recent entry per place.
 * Friends: every entry any mutual friend (from the friends list, built from
 * completed friend-spin sessions) has left, fetched fresh each time this
 * tab is opened - same fetch-on-open approach as DetailModal's "Friends'
 * Feedback" section, not a live subscription. Tapping any row reopens the
 * normal DetailModal (via that entry's stored spot snapshot) where feedback
 * is actually added/edited - this screen is purely for browsing.
 */
export default function JournalOverlay({ onBack, journal, friends, onShowDetails, location }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [tab, setTab] = useState('mine'); // 'mine' | 'friends'
  const [friendRows, setFriendRows] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  useEffect(() => {
    if (tab !== 'friends' || !isFirebaseConfigured || !friends || friends.length === 0) return;
    let cancelled = false;
    setLoadingFriends(true);
    Promise.all(friends.map(async (f) => {
      const entries = await fetchFriendJournal(f.uid);
      return Object.values(entries).flat().map((e) => ({ ...e, friendName: f.name }));
    })).then((results) => {
      if (cancelled) return;
      const flat = results.flat().sort((a, b) => b.updatedAt - a.updatedAt);
      setFriendRows(flat);
      setLoadingFriends(false);
    });
    return () => { cancelled = true; };
  }, [tab, friends]);

  // Spread `latest.spot`'s fields (address/lat/lng) onto each row so
  // groupByCity can read them directly, while still carrying `latest`/
  // `count` through for rendering.
  const mineRows = Object.values(journal || {})
    .filter((entries) => entries.length > 0)
    // Sorted by updatedAt, not just taking entries[0] - editing an older
    // entry bumps its updatedAt without moving it in storage.
    .map((entries) => {
      const latest = entries.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return { ...latest.spot, latest, count: entries.length };
    })
    .sort((a, b) => b.latest.updatedAt - a.latest.updatedAt);
  const mineByCity = groupByCity(mineRows, location);

  const renderMineRow = ({ latest, count }) => (
    <Pressable key={latest.spot.id} style={styles.row} onPress={() => onShowDetails(latest.spot)}>
      {latest.spot.photoUrl ? (
        <Image source={{ uri: latest.spot.photoUrl }} style={styles.rowImage} />
      ) : (
        <View style={styles.rowImagePlaceholder}>
          <Ionicons name="restaurant" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.rowTextCol}>
        <Text style={styles.rowTitle} numberOfLines={1}>{latest.spot.name}</Text>
        <Text style={styles.rowRating}>{'★'.repeat(latest.rating)}{'☆'.repeat(5 - latest.rating)}</Text>
        {!!latest.note && <Text style={styles.rowNote} numberOfLines={2}>{latest.note}</Text>}
        <Text style={styles.rowDate}>
          {relativeTime(latest.updatedAt)}{count > 1 ? ` · ${count} visits logged` : ''}
        </Text>
      </View>
    </Pressable>
  );

  const renderFriendRow = (entry, i) => (
    <Pressable key={`${entry.id}-${i}`} style={styles.row} onPress={() => onShowDetails(entry.spot)}>
      {entry.spot.photoUrl ? (
        <Image source={{ uri: entry.spot.photoUrl }} style={styles.rowImage} />
      ) : (
        <View style={styles.rowImagePlaceholder}>
          <Ionicons name="restaurant" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.rowTextCol}>
        <Text style={styles.rowTitle} numberOfLines={1}>{entry.spot.name}</Text>
        <Text style={styles.rowRating}>{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</Text>
        {!!entry.note && <Text style={styles.rowNote} numberOfLines={2}>{entry.note}</Text>}
        <Text style={styles.rowDate}>{entry.friendName} · {relativeTime(entry.updatedAt)}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.overlayScreen}>
      <View style={styles.overlayHeader}>
        <Pressable onPress={onBack} style={styles.overlayBack}>
          <Ionicons name="arrow-back" size={28} color={colors.accent} />
        </Pressable>
        <Text style={styles.overlayTitle}>My Reviews</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <SlidableSegmented
          options={[
            { value: 'mine', label: 'Mine' },
            { value: 'friends', label: 'Friends' },
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
      </View>

      <ScrollView style={{ width: '100%', paddingHorizontal: 20 }}>
        {tab === 'mine' && (
          <>
            {/* Search for a spot that's never come up in a spin, to leave
                feedback about it anyway (user request) - picking a result
                opens its normal detail view, where "Your Feedback" already
                handles adding/editing an entry. */}
            <PlaceSearchBar
              placeholder="Search for a restaurant to review..."
              onSelect={onShowDetails}
            />
            {mineRows.length === 0 ? (
              <Text style={styles.emptyText}>
                No reviews yet - open any spot's details and tap the pencil to add one.
              </Text>
            ) : (
              // Grouped by place (nearest-first) rather than one flat list -
              // same reasoning as Favorites: a journal collected across many
              // trips needs to stay organized by where you actually were,
              // not just when (user request).
              mineByCity.map(({ city, spots }) => (
                <View key={city} style={{ marginBottom: 8 }}>
                  <Text style={styles.categoryHeader}>{city}</Text>
                  {spots.map(renderMineRow)}
                </View>
              ))
            )}
          </>
        )}

        {tab === 'friends' && (
          <>
            {!isFirebaseConfigured ? (
              <Text style={styles.emptyText}>Friend sharing needs Firebase configured.</Text>
            ) : !friends || friends.length === 0 ? (
              <Text style={styles.emptyText}>
                No friends yet - complete a session from Feast with Friends to connect with someone.
              </Text>
            ) : loadingFriends ? (
              <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 30 }} />
            ) : friendRows.length === 0 ? (
              <Text style={styles.emptyText}>None of your friends have reviewed anything yet.</Text>
            ) : (
              friendRows.map(renderFriendRow)
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  overlayScreen: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.background, zIndex: 100, paddingTop: 60 },
  overlayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 },
  overlayTitle: { color: colors.accent, fontSize: 24, fontWeight: 'bold', letterSpacing: 1 },
  overlayBack: { padding: 5 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 16, fontStyle: 'italic', paddingHorizontal: 20 },
  categoryHeader: { color: colors.gold, fontSize: 13, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8, marginTop: 4 },

  tabRow: { flexDirection: 'row', backgroundColor: '#333', borderRadius: 22, padding: 4, marginBottom: 16 },
  // borderWidth pinned at rest (transparent) so switching tabs only ever
  // changes color, never size - same fix as App.js's modeBtn/FilterPanel's
  // toggleBtn (a sudden 0->2px border on a flex:1 sibling visibly nudges
  // the row).
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  tabBtnActive: { backgroundColor: colors.accent, ...neonSelected(colors) },
  tabText: { color: colors.textLight, fontWeight: 'bold', fontSize: 14 },
  tabTextActive: { color: colors.textDark },

  row: { flexDirection: 'row', backgroundColor: colors.card, width: '100%', padding: 10, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  rowImage: { width: 46, height: 46, borderRadius: 23, marginRight: 15 },
  rowImagePlaceholder: { width: 46, height: 46, borderRadius: 23, marginRight: 15, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' },
  rowTextCol: { flex: 1, justifyContent: 'center' },
  rowTitle: { color: colors.textLight, fontSize: 16, fontWeight: 'bold' },
  rowRating: { color: colors.gold, fontSize: 13, fontWeight: 'bold', marginTop: 1 },
  rowNote: { color: '#CCC', fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowDate: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
