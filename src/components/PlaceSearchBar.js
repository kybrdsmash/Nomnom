import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { joinParts } from '../utils/format';
import { searchPlacesByName } from '../api/placeSearch';

// Waits this long after the last keystroke before actually searching -
// each search is a real (billed) Places API call, so typing "Chipotle"
// shouldn't fire 8 requests, one per letter.
const DEBOUNCE_MS = 450;

/**
 * Free-text "search for any restaurant by name" bar, shared by the
 * Favorites tab and the Journal screen - lets someone add/review a spot
 * that was never surfaced by a spin. Purely a search+pick UI; what happens
 * on a pick (add to favorites vs. open its detail view to leave feedback)
 * is entirely up to the caller via `onSelect`.
 *
 * `trailingIcon`/`onTrailingPress`/`trailingLoading` add an optional icon
 * button at the end of the search row itself - AtTheTableCompose uses this
 * for "auto-fill from my location," so it's one persistent search bar
 * instead of two mutually-exclusive modes to switch between (user request:
 * "weird switching back and forth... keeping the live search window open as
 * well"). Omit all three for the plain search-only bar every other caller
 * still uses.
 */
export default function PlaceSearchBar({
  placeholder = 'Search for a restaurant...', onSelect,
  trailingIcon, onTrailingPress, trailingLoading,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);
  // Bumped on every keystroke so a slow, now-stale request can't clobber a
  // faster, more recent one's results if they resolve out of order.
  const requestIdRef = useRef(0);

  const onChangeText = (text) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      const found = await searchPlacesByName(text.trim());
      if (requestId === requestIdRef.current) {
        setResults(found);
        setSearching(false);
      }
    }, DEBOUNCE_MS);
  };

  const handleSelect = (spot) => {
    onSelect(spot);
    setQuery('');
    setResults([]);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.inputRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
        />
        {searching && <ActivityIndicator size="small" color={colors.accent} />}
        {!!trailingIcon && (
          <Pressable onPress={onTrailingPress} hitSlop={8} disabled={trailingLoading} style={styles.trailingBtn}>
            {trailingLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name={trailingIcon} size={18} color={colors.accent} />
            )}
          </Pressable>
        )}
      </View>

      {results.length > 0 && (
        <View style={styles.resultsBox}>
          {results.map((spot) => (
            <Pressable key={spot.id} style={styles.resultRow} onPress={() => handleSelect(spot)}>
              {spot.photoUrl ? (
                <Image source={{ uri: spot.photoUrl }} style={styles.resultImage} />
              ) : (
                <View style={styles.resultImagePlaceholder}>
                  <Ionicons name="restaurant" size={16} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle} numberOfLines={1}>{spot.name}</Text>
                <Text style={styles.resultSub} numberOfLines={1}>
                  {joinParts([spot.rating !== 'N/A' ? `⭐ ${spot.rating}` : null, spot.address])}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  wrapper: { marginBottom: 10 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  input: { flex: 1, color: colors.textLight, fontSize: 14, marginLeft: 8, padding: 0 },
  trailingBtn: { marginLeft: 8, padding: 2 },
  resultsBox: { backgroundColor: colors.card, borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', padding: 10, ...buttonDepth },
  resultImage: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  resultImagePlaceholder: {
    width: 36, height: 36, borderRadius: 18, marginRight: 10, backgroundColor: '#555',
    alignItems: 'center', justifyContent: 'center',
  },
  resultTitle: { color: colors.textLight, fontSize: 14, fontWeight: '600' },
  resultSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
});
