import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { neonSelected, buttonDepth } from '../constants';
import { isFirebaseConfigured } from '../api/firebase';
import { BOTTOM_NAV_CLEARANCE } from './BottomNav';
import { fetchFriendJournal } from '../api/journal';
import { joinParts } from '../utils/format';
import { cityFromAddress, groupByCity } from '../utils/location';
import SlidableSegmented from './SlidableSegmented';
import AtTheTableCompose from './AtTheTableCompose';
import AlphabetIndexBar from './AlphabetIndexBar';
import ReviewMilestoneBadge from './ReviewMilestoneBadge';
import FullscreenImageViewer from './FullscreenImageViewer';
import AddSpotModal from './AddSpotModal';

// Same threshold/helper used by the two screens this consolidates
// (HistoryFavoritesOverlay's Favorites/Try Later, JournalOverlay's Mine) -
// kept as its own copy here too rather than a shared import, matching the
// precedent already set between those two files (each row shape differs
// enough that sharing more than this tiny helper wasn't worth the coupling).
const ALPHABET_INDEX_THRESHOLD = 12;
function firstLetterOf(name) {
  const c = (name || '').trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}
function getInitials(name) {
  if (!name) return '';
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
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
// Same helper as HistoryFavoritesOverlay.js's own copy - kept separate per
// the same precedent as the other small helpers above.
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
 * "My Places" - the design canvas's consolidation of what used to be three
 * separate destinations (Favorites, Try Later, Journal off the hamburger)
 * into one screen with a tab selector, opened from BottomNav's "Places"
 * icon. "Friends" (mutual friends' journal entries) folds in as a fifth
 * tab, matching JournalOverlay's existing Friends tab - not a new concept,
 * just relocated here.
 *
 * Journal and Favorites have each taken turns being "the one that lives on
 * its own BottomNav icon instead of a tab here" - currently Journal (user
 * request: journaling after a meal should be "one click away," which wasn't
 * happening buried a tab deep). Favorites moved back in to take its place,
 * city-grouped same as Try Later, no toggle on its own rows (being in the
 * list already implies "favorited") - same rendering HistoryFavoritesOverlay
 * originally used for it. `tab` is a controlled prop (not local state) for
 * exactly this reason - BottomNav's Journal icon needs to force it from
 * outside, and App.js needs to read it back to highlight the right icon.
 *
 * "At the Table" (starting a brand-new review) isn't its own visible tab -
 * it's reached via the + button while on the Journal tab, exactly like
 * JournalOverlay did, just via a plain boolean here instead of a separate
 * segmented value.
 */
export default function MyPlacesHub({
  tab, onChangeTab, onBack, favorites, tryLater, history, journal, friends, location, travelType,
  onOpenMaps, onShowDetails, onRemoveTryLater, onAddFavorite, onSaveAtTheTable,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);

  // tab itself ('history' | 'tryLater' | 'favorites' | 'journal' | 'friends')
  // is now a controlled prop, not local state - lifted to App.js so
  // BottomNav's Journal icon can force it to 'journal' on every tap, and so
  // App.js's own activeNavTab can read it back to highlight the right icon.
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);
  const [cityFilter, setCityFilter] = useState(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAtTable, setShowAtTable] = useState(false);
  const [friendRows, setFriendRows] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

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

  // Switching tabs clears the search/filters from whichever tab you left -
  // "Ramen" typed while on Favorites shouldn't silently carry into Try
  // Later's search box.
  const switchTab = (next) => {
    onChangeTab(next);
    setSearchQuery('');
    setTypeFilter(null);
    setCityFilter(null);
    setShowAtTable(false);
  };

  useEffect(() => {
    if (tab !== 'friends' || !isFirebaseConfigured || !friends || friends.length === 0) return;
    let cancelled = false;
    setLoadingFriends(true);
    Promise.all(friends.map(async (f) => {
      const entries = await fetchFriendJournal(f.uid);
      return Object.values(entries).flat()
        // Was showing every entry regardless of the writer's own sharing
        // choice - shared !== false so entries saved before this flag
        // existed still show (matches the current default-shared
        // treatment everywhere else), but an explicit opt-out is honored.
        .filter((e) => e.shared !== false)
        .map((e) => ({ ...e, friendName: f.name }));
    })).then((results) => {
      if (cancelled) return;
      const flat = results.flat().sort((a, b) => b.updatedAt - a.updatedAt);
      setFriendRows(flat);
      setLoadingFriends(false);
    });
    return () => { cancelled = true; };
  }, [tab, friends]);

  const titles = { history: 'History', tryLater: 'Try Later', favorites: 'Favorites', journal: 'Journal', friends: 'Friends' };
  const emptyMessages = {
    history: 'Nothing seen yet - flip or run a bracket to populate this.',
    tryLater: 'Nothing on your try list yet - tap + to search for a place, or add one from its detail view.',
    favorites: 'No favorites saved yet.',
    journal: 'No reviews yet - tap + to add one, or open any spot\'s details and tap the pencil.',
    friends: 'No friends yet - complete a session from Feast with Friends to connect with someone.',
  };
  const searchPlaceholders = {
    history: 'Search history…',
    tryLater: 'Search try later…',
    favorites: 'Search favorites…',
    journal: 'Filter your reviews…',
  };

  // Favorites moved in here (trading places with Journal, which got its own
  // direct BottomNav icon instead - see BottomNav.js/App.js). All three get
  // a search box; Try Later and Favorites also get city grouping/chips -
  // both are "saved spots that can span multiple trips/cities" lists -
  // History is grouped by day instead (see the history branch of
  // listContent below), which is the more useful axis there. Same
  // reasoning HistoryFavoritesOverlay.js originally established for all of
  // this before Favorites relocated here.
  const isSearchableTab = tab === 'history' || tab === 'tryLater' || tab === 'favorites';
  const showCityFilter = tab === 'tryLater' || tab === 'favorites';

  const sourceList =
    tab === 'history' ? history
    : tab === 'tryLater' ? tryLater
    : tab === 'favorites' ? favorites
    : [];
  const availableTypes = isSearchableTab
    ? [...new Set(sourceList.map((s) => s.type).filter(Boolean))].sort()
    : [];
  const availableCities = showCityFilter
    ? [...new Set(sourceList.map((s) => cityFromAddress(s.address)))].sort()
    : [];
  const filtered = isSearchableTab
    ? sourceList.filter((spot) => {
        const matchesQuery = !searchQuery.trim() || spot.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
        const matchesType = !typeFilter || spot.type === typeFilter;
        const matchesCity = !showCityFilter || !cityFilter || cityFromAddress(spot.address) === cityFilter;
        return matchesQuery && matchesType && matchesCity;
      })
    : [];

  // Shared by Try Later (showTryLaterToggle: true) and Favorites (no
  // options - being in that list already implies "favorited," so no
  // toggle shown on its own rows), adapted from HistoryFavoritesOverlay.js.
  const renderRow = (spot, i, { showTryLaterToggle, rowRef } = {}) => {
    const isTry = tryLater.some((t) => t.id === spot.id);
    return (
      <View key={`${spot.id}-${i}`} ref={rowRef} style={styles.card}>
        {spot.photoUrl ? (
          <Pressable onPress={() => setFullscreenPhoto(spot.photoUrl)}>
            <Image source={{ uri: spot.photoUrl }} style={styles.rowImage} />
          </Pressable>
        ) : (
          <View style={styles.rowImagePlaceholder}>
            <Ionicons name="restaurant" size={20} color={colors.textMuted} />
          </View>
        )}
        <Pressable style={styles.rowTextCol} onPress={() => onShowDetails(spot)}>
          <Text style={styles.rowTitle} numberOfLines={1}>{spot.name}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>{joinParts([`⭐ ${spot.rating}`, spot.type])}</Text>
        </Pressable>
        {showTryLaterToggle && (
          <Pressable onPress={() => onRemoveTryLater(spot)} style={styles.rowIconBtn} hitSlop={6}>
            <Ionicons name={isTry ? 'bookmark' : 'bookmark-outline'} size={20} color={colors.gold} />
          </Pressable>
        )}
        <Pressable onPress={() => onOpenMaps(spot)} style={styles.goBtn}>
          <Ionicons name="navigate" size={22} color={colors.textDark} />
        </Pressable>
      </View>
    );
  };

  const renderCitySection = (city, spots, rowOptions) => {
    const showIndex = spots.length > ALPHABET_INDEX_THRESHOLD;
    const seenLetters = new Set();
    const availableLetters = new Set(spots.map((s) => firstLetterOf(s.name)));
    return (
      <View key={city} style={{ marginBottom: 8, paddingRight: showIndex ? 22 : 0 }}>
        <Text style={styles.categoryHeader}>{city}</Text>
        {spots.map((spot, i) => {
          const letter = firstLetterOf(spot.name);
          const isFirstOfLetter = !seenLetters.has(letter);
          seenLetters.add(letter);
          let rowRef;
          if (showIndex && isFirstOfLetter) {
            const key = `${city}::${letter}`;
            letterRefs.current[key] = letterRefs.current[key] || React.createRef();
            rowRef = letterRefs.current[key];
          }
          return renderRow(spot, i, { ...rowOptions, rowRef });
        })}
        {showIndex && (
          <AlphabetIndexBar
            availableLetters={availableLetters}
            onSelectLetter={(letter) => jumpToLetter(city, letter)}
          />
        )}
      </View>
    );
  };

  // History - day-grouped, adapted from HistoryFavoritesOverlay's own
  // History tab. Shows both a favorite-heart and a try-later-bookmark quick
  // toggle per row (unlike renderRow above, Try Later's own row, which only
  // gets the bookmark) - matches that source file's reasoning: a place
  // surfaced from search history hasn't been curated onto either list yet,
  // so both quick actions are useful there.
  const renderHistoryRow = (spot, i) => {
    const isFav = favorites.some((f) => f.id === spot.id);
    const isTry = tryLater.some((t) => t.id === spot.id);
    return (
      <View key={`${spot.id}-${i}`} style={styles.card}>
        {spot.photoUrl ? (
          <Pressable onPress={() => setFullscreenPhoto(spot.photoUrl)}>
            <Image source={{ uri: spot.photoUrl }} style={styles.rowImage} />
          </Pressable>
        ) : (
          <View style={styles.rowImagePlaceholder}>
            <Ionicons name="restaurant" size={20} color={colors.textMuted} />
          </View>
        )}
        <Pressable style={styles.rowTextCol} onPress={() => onShowDetails(spot)}>
          <Text style={styles.rowTitle} numberOfLines={1}>{spot.name}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>{joinParts([`⭐ ${spot.rating}`, spot.type])}</Text>
        </Pressable>
        <Pressable onPress={() => onAddFavorite(spot)} style={styles.rowIconBtn} hitSlop={6}>
          <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={colors.danger} />
        </Pressable>
        <Pressable onPress={() => onRemoveTryLater(spot)} style={styles.rowIconBtn} hitSlop={6}>
          <Ionicons name={isTry ? 'bookmark' : 'bookmark-outline'} size={20} color={colors.gold} />
        </Pressable>
        <Pressable onPress={() => onOpenMaps(spot)} style={styles.goBtn}>
          <Ionicons name="navigate" size={22} color={colors.textDark} />
        </Pressable>
      </View>
    );
  };

  // Journal (Mine) - adapted from JournalOverlay.
  const mineRows = Object.values(journal || {})
    .filter((entries) => entries.length > 0)
    .map((entries) => {
      const latest = entries.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return { ...latest.spot, latest, count: entries.length };
    })
    .sort((a, b) => b.latest.updatedAt - a.latest.updatedAt);
  const filteredMineRows = searchQuery.trim()
    ? mineRows.filter((r) => r.name?.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : mineRows;
  const mineByCity = groupByCity(filteredMineRows, location);

  const renderMineRow = ({ latest, count }, rowRef) => (
    <Pressable key={latest.spot.id} ref={rowRef} style={styles.card} onPress={() => onShowDetails(latest.spot)}>
      {latest.spot.photoUrl ? (
        <Image source={{ uri: latest.spot.photoUrl }} style={styles.rowImage} />
      ) : (
        <View style={styles.rowImagePlaceholder}>
          <Ionicons name="restaurant" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.rowTextCol}>
        <Text style={styles.rowTitle} numberOfLines={1}>{latest.spot.name}</Text>
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

  // Was always showing the RESTAURANT's own Google photo, never the
  // friend's actual shared picture (which never even rendered anywhere,
  // despite the whole point of sharing being "see what my friend's food
  // looked like") - now prefers the first moment with a sharedUri, falling
  // back to the spot's Google photo only when the friend didn't share one.
  const renderFriendRow = (entry, i) => {
    const sharedPhoto = entry.moments?.find((m) => m.sharedUri)?.sharedUri;
    // entry.rating is only ever set on a full Journal review - At-the-Table
    // entries deliberately have none (see AtTheTableCompose's own docs), so
    // '★'.repeat(undefined) would throw. entry.note is the old flat shape;
    // moments[0].text is what every current entry actually carries.
    const noteText = entry.note || entry.moments?.find((m) => m.text)?.text;
    return (
      <Pressable key={`${entry.id}-${i}`} style={styles.card} onPress={() => onShowDetails(entry.spot)}>
        {sharedPhoto || entry.spot.photoUrl ? (
          <Image source={{ uri: sharedPhoto || entry.spot.photoUrl }} style={styles.rowImage} />
        ) : (
          <View style={styles.rowImagePlaceholder}>
            <Ionicons name="restaurant" size={20} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.rowTextCol}>
          <Text style={styles.rowTitle} numberOfLines={1}>{entry.spot.name}</Text>
          {typeof entry.rating === 'number' && (
            <Text style={styles.rowRating}>{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</Text>
          )}
          {!!entry.occasion && <Text style={styles.rowOccasion}>{entry.occasion}</Text>}
          {!!noteText && <Text style={styles.rowNote} numberOfLines={2}>{noteText}</Text>}
          <Text style={styles.rowDate}>{entry.friendName} · {relativeTime(entry.updatedAt)}</Text>
        </View>
      </Pressable>
    );
  };

  // History can contain the same spot more than once (seen again on a
  // different day) - deduped here (keep the first/most-recent occurrence,
  // since history is already newest-first) for the AddSpotModal picker,
  // same as HistoryFavoritesOverlay's own copy of this exact logic.
  const dedupedHistory = [];
  const seenHistoryIds = new Set();
  (history || []).forEach((spot) => {
    if (!seenHistoryIds.has(spot.id)) {
      seenHistoryIds.add(spot.id);
      dedupedHistory.push(spot);
    }
  });

  // Recently-reviewed spots feed AddSpotModal's picker, same as
  // HistoryFavoritesOverlay did.
  const recentlyReviewed = Object.values(journal || {})
    .filter((entries) => entries.length > 0)
    .map((entries) => entries.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0])
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((entry) => entry.spot);

  let listContent;
  if (tab === 'history' || tab === 'tryLater' || tab === 'favorites') {
    if (sourceList.length === 0) {
      listContent = <Text style={styles.emptyText}>{emptyMessages[tab]}</Text>;
    } else if (filtered.length === 0) {
      listContent = <Text style={styles.emptyText}>No matches - try a different search or filter.</Text>;
    } else if (tab === 'favorites') {
      // No toggle on these rows (unlike Try Later's bookmark one below) -
      // being in this list already implies "favorited," same reasoning
      // HistoryFavoritesOverlay's own Favorites tab used before this moved
      // here. City-grouped (nearest-first from wherever the user currently
      // is) for the same reason Try Later is - a favorites list saved
      // across many trips gets cluttered without it.
      listContent = groupByCity(filtered, location).map(({ city, spots }) => renderCitySection(city, spots));
    } else if (tab === 'tryLater') {
      listContent = groupByCity(filtered, location).map(({ city, spots }) =>
        renderCitySection(city, spots, { showTryLaterToggle: true })
      );
    } else {
      // History - day-grouped in array order (App.js unshifts newest-first
      // on every view, same as HistoryFavoritesOverlay's own History tab),
      // not city-grouped - see isSearchableTab/showCityFilter above for why.
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
          {group.spots.map((spot, i) => renderHistoryRow(spot, i))}
        </View>
      ));
    }
  } else if (tab === 'journal') {
    if (mineRows.length === 0) {
      listContent = <Text style={styles.emptyText}>{emptyMessages.journal}</Text>;
    } else if (mineByCity.length === 0) {
      listContent = <Text style={styles.emptyText}>No reviews match "{searchQuery.trim()}".</Text>;
    } else {
      listContent = mineByCity.map(({ city, spots }) => {
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
      });
    }
  } else {
    // friends
    if (!isFirebaseConfigured) {
      listContent = <Text style={styles.emptyText}>Friend sharing needs Firebase configured.</Text>;
    } else if (!friends || friends.length === 0) {
      listContent = <Text style={styles.emptyText}>{emptyMessages.friends}</Text>;
    } else if (loadingFriends) {
      listContent = <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 30 }} />;
    } else if (friendRows.length === 0) {
      listContent = <Text style={styles.emptyText}>None of your friends have reviewed anything yet.</Text>;
    } else {
      listContent = friendRows.map(renderFriendRow);
    }
  }

  const showSearch = (isSearchableTab && sourceList.length > 0) || (tab === 'journal' && mineRows.length > 0);
  // History excluded - it's auto-populated by search activity, not manually
  // curated, so an add-FAB doesn't apply there (matches
  // HistoryFavoritesOverlay's own History tab, which never had one either).
  const showFab = (tab === 'tryLater' || tab === 'journal') && !showAtTable;

  return (
    <View style={styles.overlayScreen}>
      <View style={styles.overlayHeader}>
        <Pressable onPress={onBack} style={styles.overlayBack}>
          <Ionicons name="arrow-back" size={28} color={colors.accent} />
        </Pressable>
        <Text style={styles.overlayTitle}>My Places</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <SlidableSegmented
          options={[
            { value: 'history', label: 'History' },
            { value: 'favorites', label: 'Favorites' },
            { value: 'tryLater', label: 'Try Later' },
            { value: 'journal', label: 'Journal' },
            { value: 'friends', label: 'Friends' },
          ]}
          value={tab}
          onChange={switchTab}
          styles={{
            segmented: styles.tabRow,
            segment: styles.tabBtn,
            segmentActive: styles.tabBtnActive,
            segmentText: styles.tabText,
            segmentTextActive: styles.tabTextActive,
          }}
        />
      </View>

      {showAtTable && (
        <AtTheTableCompose location={location} travelType={travelType} onSave={onSaveAtTheTable} />
      )}

      <ScrollView
        ref={scrollViewRef}
        style={{ width: '100%', paddingHorizontal: 20, display: showAtTable ? 'none' : 'flex' }}
      >
        {showSearch && (
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={searchPlaceholders[tab]}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        )}
        {showCityFilter && availableCities.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <Pressable style={[styles.chip, !cityFilter && styles.chipActive]} onPress={() => setCityFilter(null)}>
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
        {isSearchableTab && availableTypes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            <Pressable style={[styles.chip, !typeFilter && styles.chipActive]} onPress={() => setTypeFilter(null)}>
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
        {listContent}
        {/* BottomNav now persists over this screen (was Home-only before) -
            a spacer at the end of the scroll content, sized to the bar's
            own real clearance, keeps the last row from ending up hidden
            behind it. Plain style-prop padding on the ScrollView itself
            wouldn't do this - that constrains the outer viewport, not how
            far the content can actually scroll. */}
        {/* insets.bottom added - BottomNav.js's own position now includes
            it too, so this needs to match or it'd under-reserve by exactly
            that amount on a device with a real bottom inset. */}
        <View style={{ height: insets.bottom + BOTTOM_NAV_CLEARANCE }} />
      </ScrollView>

      {showFab && (
        <Pressable
          style={styles.addFab}
          onPress={() => (tab === 'journal' ? setShowAtTable(true) : setShowAddModal(true))}
        >
          <Ionicons name="add" size={28} color={colors.textDark} />
        </Pressable>
      )}

      {/* mode/onToggle are unconditionally 'tryLater' now - the FAB that
          opens this (showFab above) only ever renders for the Try Later tab;
          Favorites (now living here too) never gets an add-FAB of its own -
          same as before, a spot becomes a favorite via the heart toggle on
          its detail view/other list rows, not a dedicated add flow here. */}
      <AddSpotModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        mode="tryLater"
        onToggle={onRemoveTryLater}
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
  overlayScreen: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.background, zIndex: 100, paddingTop: insets.top + 12 },
  overlayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 },
  overlayTitle: { color: colors.accent, fontSize: 24, fontWeight: 'bold', letterSpacing: 1 },
  overlayBack: { padding: 5 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 16, fontStyle: 'italic', paddingHorizontal: 20 },
  categoryHeader: { color: colors.gold, fontSize: 13, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  cityHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },

  tabRow: { flexDirection: 'row', backgroundColor: '#333', borderRadius: 22, padding: 4, marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  tabBtnActive: { backgroundColor: colors.accent, ...neonSelected(colors) },
  tabText: { color: colors.textLight, fontWeight: 'bold', fontSize: 12 },
  tabTextActive: { color: colors.textDark },

  card: { flexDirection: 'row', backgroundColor: colors.card, width: '100%', padding: 10, borderRadius: 12, marginBottom: 12, alignItems: 'center' },
  goBtn: { backgroundColor: colors.accent, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', ...buttonDepth },
  rowIconBtn: { padding: 6, marginRight: 4 },
  rowImage: { width: 46, height: 46, borderRadius: 23, marginRight: 15 },
  rowImagePlaceholder: { width: 46, height: 46, borderRadius: 23, marginRight: 15, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' },
  rowTextCol: { flex: 1, justifyContent: 'center', paddingRight: 10 },
  rowTitle: { color: colors.textLight, fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  rowSub: { color: colors.textMuted, fontSize: 13 },
  rowRating: { color: colors.gold, fontSize: 13, fontWeight: 'bold', marginTop: 1 },
  rowOccasion: { color: colors.accent, fontSize: 11, fontWeight: '700', marginTop: 1 },
  rowNote: { color: '#CCC', fontSize: 12, lineHeight: 16, marginTop: 2 },
  rowDate: { color: colors.textMuted, fontSize: 11, marginTop: 2 },

  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, color: colors.textLight, fontSize: 14, marginLeft: 8, padding: 0 },
  chipRow: { marginBottom: 12 },
  chip: { backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.textDark, fontWeight: 'bold' },

  addFab: {
    // bottom now clears BottomNav (persists over this screen) on top of the
    // original insets.bottom + 30, same reasoning as the scroll spacer above.
    position: 'absolute', bottom: insets.bottom + 30 + BOTTOM_NAV_CLEARANCE, right: 30, width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    ...buttonDepth, elevation: 20,
  },
});
