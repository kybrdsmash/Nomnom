import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CUISINES, neonSelected, buttonDepth, accentGradient } from '../constants';
import { useTheme } from '../ThemeContext';
import { joinParts } from '../utils/format';
import { searchNearbyByKeyword } from '../api/places';
import FaveCuisineButton from './FaveCuisineButton';

// Waits this long after the last keystroke before searching - each search
// is a real (billed) Places API call, so typing "fried chicken" shouldn't
// fire a request per letter.
const DISH_SEARCH_DEBOUNCE_MS = 500;

// Fallback only - App.js measures the real distance down past the coin and
// passes that as `scrollHeight` once the dropdown has opened at least once;
// this is just what shows before that first measurement.
const DEFAULT_SCROLL_HEIGHT = 150;

// Root cause confirmed (three false starts before this one - BlurView and
// ScrollView not respecting `card`'s overflow:hidden clip were real bugs
// worth fixing too, but neither was the actual cause of the persistent
// square-bottom-corner bug). It was `elevation` on plain nested Views this
// deep inside the clipped card (All/None buttons, cuisine bubbles, dish-
// result rows, the Fave button) - confirmed by a live test that zeroed all
// of them out and got clean rounded corners back. None of these elements
// get their own `elevation` anymore for this reason - buttonDepth/
// neonSelected's shadow* props (which only apply on iOS anyway) still give
// them depth there; Android just reads flatter here than elsewhere in the
// app, which is the trade worth making for correct corners.

/**
 * Frosted-glass dropdown for the cuisine picker. Rendered as a floating
 * overlay (not inline in FilterPanel's scroll flow), anchored flush under
 * the "Cuisines" trigger row in FilterPanel with no gap and no title of its
 * own - it's meant to read as that same header directly unfolding, not a
 * separate card, so square top corners butt straight up against the
 * trigger's (squared-off-to-match, see FilterPanel's cuisineContainerOpen)
 * bottom edge. `top`/`scrollHeight` are measured by the caller (App.js)
 * against the trigger's and coin's actual on-screen positions. Independently
 * scrollable from the page behind it.
 */
export default function CuisineDropdown({
  visible, top, scrollHeight, selectedCuisines, onToggleCuisine,
  faveCuisines, onLoadFave, onSaveFave, onRenameFave, onSelectAll, onSelectNone,
  location, travelType, onShowSpotDetails,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  // Free-text "search for a specific dish" (not a cuisine genre) - e.g.
  // "fried chicken" - finds nearby places likely to serve it, using the
  // same Nearby Search endpoint/spot shaping the normal randomizer search
  // already uses (searchNearbyByKeyword in places.js), just with the typed
  // dish as the keyword instead of a cuisine (user request).
  const [dishQuery, setDishQuery] = useState('');
  const [dishResults, setDishResults] = useState([]);
  const [dishSearching, setDishSearching] = useState(false);
  const [dishSearched, setDishSearched] = useState(false);
  const dishDebounceRef = useRef(null);
  const dishRequestIdRef = useRef(0);

  const onChangeDishQuery = (text) => {
    setDishQuery(text);
    if (dishDebounceRef.current) clearTimeout(dishDebounceRef.current);
    if (!text.trim() || !location) {
      setDishResults([]);
      setDishSearching(false);
      setDishSearched(false);
      return;
    }
    setDishSearching(true);
    dishDebounceRef.current = setTimeout(async () => {
      const requestId = ++dishRequestIdRef.current;
      const found = await searchNearbyByKeyword(location, travelType, text.trim());
      if (requestId === dishRequestIdRef.current) {
        setDishResults(found);
        setDishSearching(false);
        setDishSearched(true);
      }
    }, DISH_SEARCH_DEBOUNCE_MS);
  };

  if (!visible) return null;

  return (
    <View style={[styles.wrapper, { top }]} pointerEvents="box-none">
      {/* Only ONE view in this whole overlay carries `elevation` - `wrapper`
          below, which is what actually needs it (to paint above
          RollingFoodStrip's native-driven icons on Android). Nothing nested
          inside `card` gets its own elevation either, for the same reason -
          see the root-cause note above the component. */}
      <View style={styles.shadowLayer}>
        <View style={styles.card}>
          {/* BlurView needs its own matching border radius + overflow:hidden -
              Android doesn't reliably clip a native BlurView's content to an
              ancestor's rounded corners. */}
          <BlurView intensity={65} tint="dark" style={styles.blur} />
          {/* Theme-tinted frosted glass - a plain blur reads as neutral/grey,
              this ties it back to whatever accent color the user picked. */}
          <View style={[styles.tint, { backgroundColor: colors.accent }]} pointerEvents="none" />

        {/* All/None/search/Fave now scroll away together with the cuisine
            bubbles as one continuous list, rather than staying pinned as a
            fixed header above it (user request - the split read as two
            disconnected panels rather than one). */}
        {/* ScrollView needs its OWN matching bottom-corner radius +
            overflow:hidden too, same fix as BlurView above - it's the last
            child, its bottom edge sits exactly at the card's rounded
            bottom corners, and Android doesn't reliably clip a ScrollView's
            native scroll container to an ancestor's rounded corners either
            (confirmed by testing with BlurView removed entirely - the
            square corners persisted, so it was never BlurView specifically). */}
        <ScrollView style={[{ height: scrollHeight || DEFAULT_SCROLL_HEIGHT }, styles.scroll]} showsVerticalScrollIndicator>
          {/* All/None on the left, a specific-dish search in the middle, the
              Fave 1/2/3 slider on the right. All/None both functionally mean
              "no cuisine filter" (an empty OR a fully-selected list both
              match everything), so both fire the same "no filter applied"
              toast up in App.js rather than silently doing nothing the user
              can't tell happened. */}
          <View style={styles.topRow}>
            <Pressable style={styles.allNoneBtn} onPress={onSelectAll}>
              <Text style={styles.allNoneText}>All</Text>
            </Pressable>
            <Pressable style={styles.allNoneBtn} onPress={onSelectNone}>
              <Text style={styles.allNoneText}>None</Text>
            </Pressable>
            <View style={styles.dishSearchRow}>
              <Ionicons name="restaurant-outline" size={14} color={colors.textMuted} />
              <TextInput
                style={styles.dishSearchInput}
                value={dishQuery}
                onChangeText={onChangeDishQuery}
                placeholder="Search a dish..."
                placeholderTextColor={colors.textMuted}
                editable={!!location}
              />
              {dishSearching && <ActivityIndicator size="small" color={colors.accent} />}
            </View>
            <FaveCuisineButton
              slots={faveCuisines}
              onLoad={onLoadFave}
              onSave={onSaveFave}
              onRename={onRenameFave}
              selectedCuisines={selectedCuisines}
            />
          </View>

          {dishSearched && !dishSearching && dishResults.length === 0 && (
            <Text style={styles.dishEmptyText}>Nothing nearby matched that - try a different search.</Text>
          )}
          {dishResults.length > 0 && (
            <View style={styles.dishResultsBox}>
              {dishResults.map((spot) => (
                <Pressable
                  key={spot.id}
                  style={styles.dishResultRow}
                  onPress={() => {
                    onShowSpotDetails(spot);
                    setDishQuery('');
                    setDishResults([]);
                    setDishSearched(false);
                  }}
                >
                  {spot.photoUrl ? (
                    <Image source={{ uri: spot.photoUrl }} style={styles.dishResultImage} />
                  ) : (
                    <View style={styles.dishResultImagePlaceholder}>
                      <Ionicons name="restaurant" size={16} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dishResultTitle} numberOfLines={1}>{spot.name}</Text>
                    <Text style={styles.dishResultSub} numberOfLines={1}>
                      {joinParts([`⭐ ${spot.rating}`, spot.distance])}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.bubblesWrap}>
            {CUISINES.map((cuisine) => {
              const isActive = selectedCuisines.includes(cuisine);
              return (
                // Fixed width (not content-sized) - always exactly 3 per
                // row regardless of name length, so short ("BBQ") and long
                // ("Middle Eastern") cuisines don't produce a variable,
                // harder-to-scan number of bubbles per row (user feedback).
                <Pressable
                  key={`${cuisine}-${isActive}`}
                  style={[styles.bubble, isActive && styles.bubbleActive]}
                  onPress={() => onToggleCuisine(cuisine)}
                >
                  {/* Same glossy diagonal gradient as the coin (accentGradient
                      in constants.js) - user request, after liking it there. */}
                  {isActive && (
                    <LinearGradient {...accentGradient(colors)} style={StyleSheet.absoluteFill} />
                  )}
                  <Text style={[styles.bubbleText, isActive && styles.bubbleTextActive]}>
                    {cuisine}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // elevation (not just zIndex) is what actually matters here on Android -
  // RollingFoodStrip's rolling icons are native-driven Animated.Image
  // transforms, which Android commonly promotes onto their own compositing
  // layer; a later sibling with only zIndex isn't guaranteed to paint above
  // that layer, so the rolling food was visibly cutting into the dropdown
  // (user feedback). A high explicit elevation forces this above it.
  wrapper: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 60, elevation: 60 },
  // NO elevation here - see the comment above where this renders. `wrapper`
  // already carries the one elevation this overlay needs; this view exists
  // only to hold the shape (borderRadius) and iOS shadow* props (which
  // don't have Android's elevation-vs-overflow conflict) line up with
  // `card`'s own rounding. Width matches the 85%-centered convention every
  // other filter card on this screen already uses.
  shadowLayer: {
    width: '85%', borderTopLeftRadius: 0, borderTopRightRadius: 0,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    backgroundColor: colors.card, ...buttonDepth, elevation: 0,
  },
  // Top corners square (flush against the trigger's own squared-off bottom
  // edge above it - see FilterPanel's cuisineContainerOpen), bottom corners
  // rounded. Owns the actual corner clipping - no elevation here, see the
  // comment above where this renders.
  card: {
    width: '100%', borderTopLeftRadius: 0, borderTopRightRadius: 0,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden',
    backgroundColor: colors.card,
  },
  // Matches card's own bottom corner radii - see the comment where this
  // renders for why the ScrollView needs this explicitly, not just the
  // ancestor `card`'s overflow:hidden.
  scroll: {
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden',
  },
  // Matches card's own corner radii exactly - see the comment where this
  // renders.
  blur: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden',
  },
  tint: { ...StyleSheet.absoluteFillObject, opacity: 0.22 },
  // All four controls (All/None/dish search/Fave) share one row - the search
  // field takes whatever room is left (flex:1, see dishSearchRow) rather
  // than a fixed width, since it's the one element that can reasonably
  // shrink on a narrow phone.
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 14,
  },
  // colors.card (not cardAlt, which the cuisine bubbles below use) - this
  // whole row is a distinct set of controls, not more selections, so it
  // reads as its own strip rather than blending into the bubble grid
  // (user request). FaveCuisineButton picks up the same shade independently.
  allNoneBtn: {
    paddingHorizontal: 10, paddingVertical: 10, borderRadius: 16, marginRight: 6,
    backgroundColor: colors.card, ...buttonDepth, elevation: 0,
  },
  allNoneText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  dishSearchRow: {
    flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 14, paddingHorizontal: 8, paddingVertical: 7, marginRight: 6, minWidth: 0,
  },
  dishSearchInput: { flex: 1, color: colors.textLight, fontSize: 12, marginLeft: 5, padding: 0 },
  dishEmptyText: {
    color: colors.textMuted, fontSize: 11, fontStyle: 'italic',
    marginTop: 6, marginHorizontal: 14,
  },
  dishResultsBox: {
    backgroundColor: colors.cardAlt, borderRadius: 12, marginTop: 8, marginHorizontal: 14, overflow: 'hidden',
  },
  dishResultRow: { flexDirection: 'row', alignItems: 'center', padding: 8, ...buttonDepth, elevation: 0 },
  dishResultImage: { width: 32, height: 32, borderRadius: 16, marginRight: 8 },
  dishResultImagePlaceholder: {
    width: 32, height: 32, borderRadius: 16, marginRight: 8, backgroundColor: '#555',
    alignItems: 'center', justifyContent: 'center',
  },
  dishResultTitle: { color: colors.textLight, fontSize: 13, fontWeight: '600' },
  dishResultSub: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  bubblesWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 14, paddingBottom: 16 },
  // Fixed width (~3 per row incl. horizontal margin) instead of content-
  // sized - see the comment above where these render. Text wraps to a
  // second line rather than truncating, so long names ("Middle Eastern")
  // stay fully readable instead of being cut off to fit the column.
  // Same constant-elevation fix as every other selected/unselected toggle -
  // Android can leave a view stuck blank after its elevation changes
  // between renders.
  bubble: {
    width: '30%', marginHorizontal: '1.3%', marginVertical: 4,
    backgroundColor: colors.cardAlt, paddingHorizontal: 8, paddingVertical: 10,
    borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    ...buttonDepth, elevation: 0,
  },
  bubbleActive: {
    backgroundColor: colors.accent, ...neonSelected(colors),
    elevation: 0,
  },
  bubbleText: { color: colors.textMuted, fontWeight: '600', fontSize: 13, textAlign: 'center' },
  bubbleTextActive: { color: colors.textDark, fontWeight: 'bold' },
});
