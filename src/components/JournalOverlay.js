import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { neonSelected, buttonDepth } from '../constants';
import { isFirebaseConfigured } from '../api/firebase';
import { fetchFriendJournal } from '../api/journal';
import { groupByCity } from '../utils/location';
import SlidableSegmented from './SlidableSegmented';
import AtTheTableCompose from './AtTheTableCompose';
import AlphabetIndexBar from './AlphabetIndexBar';
import ReviewMilestoneBadge from './ReviewMilestoneBadge'; // prototype reward-system UI, see src/api/rewards.js

// Same threshold/helper as HistoryFavoritesOverlay's Favorites/Try Later
// city sections - kept as a separate copy rather than a shared import since
// each screen's row shape differs enough that sharing more than this tiny
// helper wasn't worth the coupling.
const ALPHABET_INDEX_THRESHOLD = 12;
function firstLetterOf(name) {
  const c = (name || '').trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

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
 * "Journal" - browse the whole food journal, off the hamburger menu. Has its
 * own Mine/Friends/At the Table tabs, so the header doesn't need "My" in
 * front of it too (user request).
 * Mine: every place you've left feedback on, most recent entry per place.
 * Friends: every entry any mutual friend (from the friends list, built from
 * completed friend-spin sessions) has left, fetched fresh each time this
 * tab is opened - same fetch-on-open approach as DetailModal's "Friends'
 * Feedback" section, not a live subscription. Tapping any row reopens the
 * normal DetailModal (via that entry's stored spot snapshot) where feedback
 * is actually added/edited - this screen is purely for browsing.
 */
export default function JournalOverlay({
  onBack, journal, friends, onShowDetails, location, travelType, onSaveAtTheTable,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);
  const [tab, setTab] = useState('mine'); // 'mine' | 'friends' | 'atTable'
  const [friendRows, setFriendRows] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  // Mine-tab-only, plain client-side filter over places already reviewed -
  // NOT a live Google search for a new place, which is what this used to be
  // (PlaceSearchBar) and read as confusing (user report: a "search" box on
  // an already-reviewed list that actually searched all of Google). Starting
  // a brand-new review now lives behind the + button below instead, which
  // routes to At the Table.
  const [mineQuery, setMineQuery] = useState('');
  // Backs the Mine tab's alphabet index - same measureLayout-based jump
  // approach as HistoryFavoritesOverlay's Favorites/Try Later sections.
  const scrollViewRef = useRef(null);
  const letterRefs = useRef({});
  const jumpToLetter = (city, letter) => {
    const rowRef = letterRefs.current[`${city}::${letter}`];
    if (!rowRef?.current || !scrollViewRef.current) return;
    rowRef.current.measureLayout(
      scrollViewRef.current,
      (_x, y) => scrollViewRef.current.scrollTo({ y: y - 8, animated: true }),
      () => {}
    );
  };

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
  const filteredMineRows = mineQuery.trim()
    ? mineRows.filter((r) => r.name?.toLowerCase().includes(mineQuery.trim().toLowerCase()))
    : mineRows;
  const mineByCity = groupByCity(filteredMineRows, location);

  const renderMineRow = ({ latest, count }, rowRef) => (
    <Pressable key={latest.spot.id} ref={rowRef} style={styles.row} onPress={() => onShowDetails(latest.spot)}>
      {latest.spot.photoUrl ? (
        <Image source={{ uri: latest.spot.photoUrl }} style={styles.rowImage} />
      ) : (
        <View style={styles.rowImagePlaceholder}>
          <Ionicons name="restaurant" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.rowTextCol}>
        <Text style={styles.rowTitle} numberOfLines={1}>{latest.spot.name}</Text>
        {/* "At the Table" entries (AtTheTableCompose) have no star rating by
            design - a fast in-the-moment note, not a formal review - so this
            only renders when one actually exists. Bare `.repeat(undefined)`
            throws (coerces to NaN), which is exactly what an At-the-Table
            entry surfacing here as `latest` used to hit. */}
        {typeof latest.rating === 'number' && (
          <Text style={styles.rowRating}>{'★'.repeat(latest.rating)}{'☆'.repeat(5 - latest.rating)}</Text>
        )}
        {!!latest.occasion && <Text style={styles.rowOccasion}>{latest.occasion}</Text>}
        {!!latest.note && <Text style={styles.rowNote} numberOfLines={2}>{latest.note}</Text>}
        {!latest.note && !!latest.moments?.[0]?.text && (
          <Text style={styles.rowNote} numberOfLines={2}>{latest.moments[0].text}</Text>
        )}
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
        <Text style={styles.overlayTitle}>Journal</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <SlidableSegmented
          options={[
            { value: 'mine', label: 'Mine' },
            { value: 'friends', label: 'Friends' },
            { value: 'atTable', label: 'At the Table' },
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

      {/* Its own component (with its own ScrollView) rather than another
          branch inside the ScrollView below - a MapView-in-a-ScrollView
          style nesting issue, just with a ScrollView instead (same reasoning
          documented elsewhere in this codebase, e.g. SpotsMap's callers). */}
      {tab === 'atTable' && (
        <AtTheTableCompose location={location} travelType={travelType} onSave={onSaveAtTheTable} />
      )}

      <ScrollView ref={scrollViewRef} style={{ width: '100%', paddingHorizontal: 20, display: tab === 'atTable' ? 'none' : 'flex' }}>
        {tab === 'mine' && (
          <>
            {/* Filters places already reviewed - NOT a live search for a new
                one (see mineQuery's own comment above for why that changed).
                Only shown once there's something to filter. */}
            {mineRows.length > 0 && (
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={mineQuery}
                  onChangeText={setMineQuery}
                  placeholder="Filter your reviews..."
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            )}
            {mineRows.length === 0 ? (
              <Text style={styles.emptyText}>
                No reviews yet - tap + to add one, or open any spot's details and tap the pencil.
              </Text>
            ) : mineByCity.length === 0 ? (
              <Text style={styles.emptyText}>No reviews match "{mineQuery.trim()}".</Text>
            ) : (
              // Grouped by place (nearest-first) rather than one flat list -
              // same reasoning as Favorites: a journal collected across many
              // trips needs to stay organized by where you actually were,
              // not just when (user request).
              mineByCity.map(({ city, spots }) => {
                const showIndex = spots.length > ALPHABET_INDEX_THRESHOLD;
                const seenLetters = new Set();
                const availableLetters = new Set(spots.map((s) => firstLetterOf(s.name)));
                return (
                  <View key={city} style={{ marginBottom: 8, paddingRight: showIndex ? 22 : 0 }}>
                    <View style={styles.cityHeaderRow}>
                      <Text style={styles.categoryHeader}>{city}</Text>
                      <ReviewMilestoneBadge count={spots.length} />
                    </View>
                    {spots.map((row) => {
                      const letter = firstLetterOf(row.name);
                      const isFirstOfLetter = !seenLetters.has(letter);
                      seenLetters.add(letter);
                      let rowRef;
                      if (showIndex && isFirstOfLetter) {
                        const key = `${city}::${letter}`;
                        letterRefs.current[key] = letterRefs.current[key] || React.createRef();
                        rowRef = letterRefs.current[key];
                      }
                      return renderMineRow(row, rowRef);
                    })}
                    {showIndex && (
                      <AlphabetIndexBar
                        availableLetters={availableLetters}
                        onSelectLetter={(letter) => jumpToLetter(city, letter)}
                      />
                    )}
                  </View>
                );
              })
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

      {/* Starting a brand-new review now routes to At the Table instead of
          the old live-search-any-restaurant box that used to sit above the
          Mine list (user request) - it already has both a search-by-name
          field and a geolocation lookup (one merged bar, see
          AtTheTableCompose's own note), so nothing is actually lost, just
          consolidated into one place. */}
      {tab === 'mine' && (
        <Pressable style={styles.addFab} onPress={() => setTab('atTable')}>
          <Ionicons name="add" size={28} color={colors.textDark} />
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (colors, insets = { top: 0, bottom: 0, left: 0, right: 0 }) => StyleSheet.create({
  // paddingTop was a flat 60 guess (status-bar clearance, tuned on one
  // physical phone - core RN's SafeAreaView is an iOS-only no-op). insets.top
  // is the real per-device measurement; +12 is a small deliberate gap above
  // the header row, matching FriendSpin.js/HistoryFavoritesOverlay.js's
  // identical full-screen-overlay headers.
  overlayScreen: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.background, zIndex: 100, paddingTop: insets.top + 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, color: colors.textLight, fontSize: 14, marginLeft: 8, padding: 0 },
  addFab: {
    position: 'absolute', bottom: insets.bottom + 30, right: 30, width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    ...buttonDepth, elevation: 20,
  },
  overlayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 },
  overlayTitle: { color: colors.accent, fontSize: 24, fontWeight: 'bold', letterSpacing: 1 },
  overlayBack: { padding: 5 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 16, fontStyle: 'italic', paddingHorizontal: 20 },
  cityHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  categoryHeader: { color: colors.gold, fontSize: 13, fontWeight: 'bold', letterSpacing: 1 },

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
  rowOccasion: { color: colors.accent, fontSize: 11, fontWeight: '700', marginTop: 1 },
  rowNote: { color: '#CCC', fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowDate: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
