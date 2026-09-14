import React, { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { joinParts } from '../utils/format';
import { cityFromAddress, groupByCity } from '../utils/location';
import FullscreenImageViewer from './FullscreenImageViewer';
import AddFavoriteModal from './AddFavoriteModal';

// First letter of up to the first two words, e.g. "Isaac Rivera" -> "IR",
// "Sam" -> "S". Used for the friend-spin token badge - there's no custom
// "two friends" icon asset available, so this is the common chat-app
// convention (initials in a small circle) instead.
function getInitials(name) {
  if (!name) return '';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// "Today" / "Yesterday" / "Jul 26, 2026" for a History section header.
function formatDateLabel(timestamp) {
  const d = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a, b) => a.toDateString() === b.toDateString();
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Full-screen overlay for History, Favorites, and Try Later lists. All
 * three share the same search box + cuisine-type filter chips (user
 * feedback: History got these first, but Favorites/Try Later get just as
 * hard to scan once they're full). Favorites are grouped by cuisine
 * category; History is grouped by the calendar day each spot was shown
 * (everything seen, not just spots someone requested directions to - see
 * App.js's addToHistory); Try Later is a flat list.
 */
export default function HistoryFavoritesOverlay({
  activeView,
  onBack,
  history,
  favorites,
  tryLater,
  onOpenMaps,
  onShowDetails,
  onRemoveTryLater,
  onAddFavorite,
  journal,
  location,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);
  // Shared across all three lists. Resets naturally each time the overlay
  // remounts - App.js only renders it while a non-'main' view is active, and
  // the only way to switch tabs is back to 'main' and in again.
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState(null); // null = All
  // Favorites-only - which city to show, derived from each favorite's
  // stored address (see groupByCity in utils/location.js). Grouping by
  // place instead of a flat/cuisine-only list is what keeps a large,
  // travel-spanning favorites collection navigable (user request).
  const [cityFilter, setCityFilter] = useState(null); // null = All
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  // Everything needed to add a new favorite now lives behind the "+"
  // button (see AddFavoriteModal) instead of an always-visible search bar
  // at the top of the screen (user request).
  const [showAddModal, setShowAddModal] = useState(false);

  const titles = { history: 'History', favorites: 'Favorites', tryLater: 'Try Later' };
  const emptyMessages = {
    history: 'Nothing seen yet - flip or run a bracket to populate this.',
    favorites: 'No favorites saved yet.',
    tryLater: 'Nothing on your try list yet. Add spots from their detail view.',
  };
  const searchPlaceholders = {
    history: 'Search history…',
    favorites: 'Search favorites…',
    tryLater: 'Search try later…',
  };

  // History can contain the same spot more than once (seen again on a
  // different day) - deduped here (keep the first/most-recent occurrence,
  // since history is already newest-first) for the AddFavoriteModal picker,
  // where seeing the same place 3 times would just be noise.
  const dedupedHistory = [];
  const seenHistoryIds = new Set();
  history.forEach((spot) => {
    if (!seenHistoryIds.has(spot.id)) {
      seenHistoryIds.add(spot.id);
      dedupedHistory.push(spot);
    }
  });

  // Most recent journal entry's spot per place, newest first - same
  // "recently reviewed" data JournalOverlay's Mine tab shows, just reduced
  // to the spot snapshots for the AddFavoriteModal picker.
  const recentlyReviewed = Object.values(journal || {})
    .filter((entries) => entries.length > 0)
    .map((entries) => entries.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0])
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => entry.spot);

  // showFavoriteToggle/showTryLaterToggle add quick heart/bookmark actions
  // next to the navigate button - used on History and Try Later rows so
  // either list can add/remove a spot from Favorites (or Try Later) without
  // opening its full detail view first (user request). Favorites rows don't
  // get these - being in the list already implies "favorited."
  const renderRow = (spot, i, { showFavoriteToggle, showTryLaterToggle } = {}) => {
    const isFav = favorites.some((f) => f.id === spot.id);
    const isTry = tryLater.some((t) => t.id === spot.id);
    return (
      <View key={`${spot.id}-${i}`} style={styles.historyCard}>
        <View>
          {spot.photoUrl ? (
            <Pressable onPress={() => setFullscreenPhoto(spot.photoUrl)}>
              <Image source={{ uri: spot.photoUrl }} style={styles.rowImage} />
            </Pressable>
          ) : (
            <View style={styles.rowImagePlaceholder}>
              <Ionicons name="restaurant" size={20} color={colors.textMuted} />
            </View>
          )}
          {!!spot.friendName && (
            <View style={styles.friendToken}>
              <Text style={styles.friendTokenText}>{getInitials(spot.friendName)}</Text>
            </View>
          )}
        </View>
        <Pressable style={styles.rowTextCol} onPress={() => onShowDetails(spot)}>
          <Text style={styles.rowTitle} numberOfLines={1}>{spot.name}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>{joinParts([`⭐ ${spot.rating}`, spot.type])}</Text>
          {!!spot.friendName && (
            <Text style={styles.friendLabel} numberOfLines={1}>Spun with {spot.friendName}</Text>
          )}
        </Pressable>
        {showFavoriteToggle && (
          <Pressable onPress={() => onAddFavorite(spot)} style={styles.rowIconBtn} hitSlop={6}>
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={colors.danger} />
          </Pressable>
        )}
        {showTryLaterToggle && (
          <Pressable onPress={() => onRemoveTryLater(spot)} style={styles.rowIconBtn} hitSlop={6}>
            <Ionicons name={isTry ? 'bookmark' : 'bookmark-outline'} size={20} color={colors.gold} />
          </Pressable>
        )}
        <Pressable onPress={() => onOpenMaps(spot)} style={styles.historyGoBtn}>
          <Ionicons name="navigate" size={22} color={colors.textDark} />
        </Pressable>
      </View>
    );
  };

  const sourceList = activeView === 'favorites' ? favorites : activeView === 'tryLater' ? tryLater : history;
  const availableTypes = [...new Set(sourceList.map((s) => s.type).filter(Boolean))].sort();
  const availableCities = activeView === 'favorites'
    ? [...new Set(sourceList.map((s) => cityFromAddress(s.address)))].sort()
    : [];
  const filtered = sourceList.filter((spot) => {
    const matchesQuery = !searchQuery.trim() || spot.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const matchesType = !typeFilter || spot.type === typeFilter;
    const matchesCity = activeView !== 'favorites' || !cityFilter || cityFromAddress(spot.address) === cityFilter;
    return matchesQuery && matchesType && matchesCity;
  });

  const filterBar = sourceList.length > 0 && (
    <>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={searchPlaceholders[activeView]}
          placeholderTextColor={colors.textMuted}
        />
      </View>
      {/* Favorites-only - lets you jump straight to a specific city's
          favorites regardless of where you physically are right now (e.g.
          browsing Tahoe favorites from home), on top of the automatic
          nearest-first grouping below. */}
      {activeView === 'favorites' && availableCities.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <Pressable
            style={[styles.chip, !cityFilter && styles.chipActive]}
            onPress={() => setCityFilter(null)}
          >
            <Text style={[styles.chipText, !cityFilter && styles.chipTextActive]}>All Places</Text>
          </Pressable>
          {availableCities.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, cityFilter === c && styles.chipActive]}
              onPress={() => setCityFilter(cityFilter === c ? null : c)}
            >
              <Text style={[styles.chipText, cityFilter === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {availableTypes.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <Pressable
            style={[styles.chip, !typeFilter && styles.chipActive]}
            onPress={() => setTypeFilter(null)}
          >
            <Text style={[styles.chipText, !typeFilter && styles.chipTextActive]}>All</Text>
          </Pressable>
          {availableTypes.map((t) => (
            <Pressable
              key={t}
              style={[styles.chip, typeFilter === t && styles.chipActive]}
              onPress={() => setTypeFilter(typeFilter === t ? null : t)}
            >
              <Text style={[styles.chipText, typeFilter === t && styles.chipTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </>
  );

  let listContent;
  if (sourceList.length === 0) {
    listContent = <Text style={styles.emptyText}>{emptyMessages[activeView]}</Text>;
  } else if (filtered.length === 0) {
    listContent = <Text style={styles.emptyText}>No matches - try a different search or filter.</Text>;
  } else if (activeView === 'favorites') {
    // Grouped by place (nearest-first, from wherever the user currently is)
    // rather than cuisine - solves the actual problem for someone saving
    // favorites across many trips: not wanting home favorites cluttering
    // the list while visiting Tahoe or Sacramento (user request). Cuisine
    // is still visible per-row via the existing rating/type subtitle line.
    listContent = groupByCity(filtered, location).map(({ city, spots }) => (
      <View key={city} style={{ marginBottom: 8 }}>
        <Text style={styles.categoryHeader}>{city}</Text>
        {spots.map((spot, i) => renderRow(spot, i))}
      </View>
    ));
  } else if (activeView === 'tryLater') {
    listContent = filtered.map((spot, i) =>
      renderRow(spot, i, { showFavoriteToggle: true, showTryLaterToggle: true })
    );
  } else {
    // history is already newest-first (App.js unshifts on every view), so
    // grouping by day in array order keeps the whole list newest-first too.
    const dateGroups = [];
    const groupByKey = new Map();
    filtered.forEach((spot) => {
      const key = new Date(spot.viewedAt || 0).toDateString();
      let group = groupByKey.get(key);
      if (!group) {
        group = { key, spots: [] };
        groupByKey.set(key, group);
        dateGroups.push(group);
      }
      group.spots.push(spot);
    });
    listContent = dateGroups.map((group) => (
      <View key={group.key} style={{ marginBottom: 8 }}>
        <Text style={styles.categoryHeader}>{formatDateLabel(group.spots[0].viewedAt || 0)}</Text>
        {group.spots.map((spot, i) =>
          renderRow(spot, i, { showFavoriteToggle: true, showTryLaterToggle: true })
        )}
      </View>
    ));
  }

  return (
    <View style={styles.overlayScreen}>
      <View style={styles.overlayHeader}>
        <Pressable onPress={onBack} style={styles.overlayBack}>
          <Ionicons name="arrow-back" size={28} color={colors.accent} />
        </Pressable>
        <Text style={styles.overlayTitle}>{titles[activeView]}</Text>
        <View style={{ width: 28 }} />
      </View>
      <ScrollView style={{ width: '100%', paddingHorizontal: 20 }}>
        {filterBar}
        {listContent}
      </ScrollView>

      {/* Favorites-only - opens AddFavoriteModal: search any restaurant by
          name, or pick straight from Try Later/History/Reviewed (user
          request - moved out of an always-visible search bar). */}
      {activeView === 'favorites' && (
        <Pressable style={styles.addFab} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={28} color={colors.textDark} />
        </Pressable>
      )}

      <AddFavoriteModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onToggleFavorite={onAddFavorite}
        favorites={favorites}
        tryLater={tryLater}
        history={dedupedHistory}
        recentlyReviewed={recentlyReviewed}
      />

      <FullscreenImageViewer
        visible={fullscreenPhoto !== null}
        photos={fullscreenPhoto ? [fullscreenPhoto] : []}
        onClose={() => setFullscreenPhoto(null)}
      />
    </View>
  );
}

const makeStyles = (colors, insets = { top: 0, bottom: 0, left: 0, right: 0 }) => StyleSheet.create({
  // paddingTop was a flat 60 guess (status-bar clearance, tuned on one
  // physical phone - core RN's SafeAreaView is an iOS-only no-op). insets.top
  // is the real per-device measurement; +12 is a small deliberate gap above
  // the header row, matching FriendSpin.js/JournalOverlay.js's identical
  // full-screen-overlay headers.
  overlayScreen: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.background, zIndex: 100, paddingTop: insets.top + 12 },
  overlayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 },
  overlayTitle: { color: colors.accent, fontSize: 24, fontWeight: 'bold', letterSpacing: 1 },
  overlayBack: { padding: 5 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 16, fontStyle: 'italic', paddingHorizontal: 20 },
  categoryHeader: { color: colors.gold, fontSize: 13, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  historyCard: { flexDirection: 'row', backgroundColor: colors.card, width: '100%', padding: 10, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  historyGoBtn: { backgroundColor: colors.accent, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', ...buttonDepth },
  rowIconBtn: { padding: 6, marginRight: 4 },
  rowImage: { width: 46, height: 46, borderRadius: 23, marginRight: 15 },
  rowImagePlaceholder: { width: 46, height: 46, borderRadius: 23, marginRight: 15, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' },
  rowTextCol: { flex: 1, justifyContent: 'center', paddingRight: 10 },
  rowTitle: { color: colors.textLight, fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
  rowSub: { color: colors.textMuted, fontSize: 13 },
  // Initials token for a friend-spin pick - no custom "two friends" icon
  // asset available, so this uses the common chat-app convention (initials
  // in a small circle) instead, cut into the corner of the thumbnail.
  friendToken: {
    position: 'absolute', bottom: -2, right: 11, width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
  },
  friendTokenText: { color: colors.textDark, fontSize: 9, fontWeight: 'bold' },
  friendLabel: { color: colors.accent, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, color: colors.textLight, fontSize: 14, marginLeft: 8, padding: 0 },
  chipRow: { marginBottom: 12 },
  chip: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.textDark, fontWeight: 'bold' },
  // bottom adds insets.bottom on top of the original 30 - this FAB sits
  // absolutely positioned near the true bottom edge, so without it a
  // home-indicator/gesture-bar inset could collide with (or sit underneath)
  // the button on devices that have one.
  addFab: {
    position: 'absolute', bottom: insets.bottom + 30, right: 30, width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    ...buttonDepth, elevation: 20,
  },
});
