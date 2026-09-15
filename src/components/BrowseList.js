import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { joinParts } from '../utils/format';
import { accentRamp, contrastTextColor } from '../utils/color';
import FullscreenImageViewer from './FullscreenImageViewer';
import SpotsMap from './SpotsMap';

// Cap on how many simultaneous "kept" pins get their own ramp step - matches
// list mode's own target count (see App.js's targetCount for gameMode
// 'list'), so every spot that can ever appear here gets a distinct color.
const MAX_HIGHLIGHTS = 12;

/**
 * "List" mode: browse the best-ranked spots from the current pool (already
 * sorted by review count in places.js) instead of a single pick or an
 * elimination bracket. Tapping a spot opens the same DetailModal every
 * other spot in the app uses - no "winner" concept here, just browsing.
 * Refresh re-runs the search; since filters haven't changed it's served
 * from the same cached pool for free until it runs out (see places.js's
 * `allowRepeats: false` - no padding with repeats once fresh spots run low,
 * unlike a single flip or bracket).
 *
 * No cuisine-grouped sections (user request: drop the "[Cuisine] Spots
 * Nearby" banners entirely) - just one flat list in the pool's existing
 * review-count order. The cuisine is still surfaced, just inline per card
 * instead of as a section header - see renderCard below.
 */
export default function BrowseList({ spots, location, onRefresh, onCancel, onShowDetails }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  // Most recently tapped spot - always exactly one (or none), replaced by
  // whichever row was viewed last (user request: highlight the most
  // recently selected spot on the mini map, which wasn't wired up at all
  // for this screen before).
  const [selectedId, setSelectedId] = useState(null);
  // Long-pressed spots stay highlighted regardless of what's since been
  // tapped/viewed (user request: "a long press should keep a place
  // highlighted") - toggled on/off by long-pressing the same row again.
  const [keptIds, setKeptIds] = useState(() => new Set());

  // One color per LIST POSITION (not per selection order), so a spot's color
  // stays stable no matter when it was tapped/kept - dark to light across
  // the user's own accent color (user request), capped at MAX_HIGHLIGHTS
  // steps since that's the most spots this screen ever shows at once.
  const ramp = useMemo(
    () => accentRamp(colors.accent, Math.min(MAX_HIGHLIGHTS, Math.max(1, spots.length))),
    [colors.accent, spots.length]
  );
  const highlights = useMemo(() => {
    const map = {};
    spots.forEach((spot, i) => {
      if (spot.id === selectedId || keptIds.has(spot.id)) {
        map[spot.id] = { color: ramp[i % ramp.length], label: i + 1 };
      }
    });
    return map;
  }, [spots, selectedId, keptIds, ramp]);

  const toggleKept = (id) => {
    Haptics.selectionAsync();
    setKeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCard = (spot) => {
    // Whole-card tint instead of a small side dot (user request: "make the
    // whole bar that color instead of just a dot") - contrastTextColor picks
    // black/white per row since accentRamp spans very dark to very light.
    const highlight = highlights[spot.id];
    const onTint = highlight ? contrastTextColor(highlight.color) : null;

    return (
      <Pressable
        key={spot.id}
        style={[styles.card, highlight && { backgroundColor: highlight.color }]}
        onPress={() => { setSelectedId(spot.id); onShowDetails(spot); }}
        onLongPress={() => toggleKept(spot.id)}
        delayLongPress={500}
      >
        {spot.photoUrl ? (
          <Pressable onPress={() => setFullscreenPhoto(spot.photoUrl)}>
            <Image source={{ uri: spot.photoUrl }} style={styles.image} />
          </Pressable>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="restaurant" size={20} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.textCol}>
          <Text style={[styles.title, onTint && { color: onTint }]} numberOfLines={1}>{spot.name}</Text>
          <Text style={[styles.sub, onTint && { color: onTint, opacity: 0.75 }]} numberOfLines={1}>
            {/* Prefer the actually-confirmed cuisine (the filter that matched,
                e.g. "Mexican") over Google's own type label when both are
                known - it's the more meaningful/trustworthy one here, since
                it's tied to what was actually searched for rather than
                Google's sometimes-generic classification. Falls back to
                `type` when no cuisine filter was active (confirmedCuisine is
                null) or the spot's cuisine wasn't confirmed at all. */}
            {joinParts([`⭐ ${spot.rating}`, spot.confirmedCuisine || spot.type, spot.distance])}
          </Text>
          {/* Favorites-only mode reaching past the distance setting for this
              one (see places.js's pickFromFavorites) - user request: always
              say so, never serve it silently. */}
          {spot.beyondLimit && (
            <Text style={[styles.beyondLimitText, onTint && { color: onTint, opacity: 0.75 }]} numberOfLines={1}>
              Beyond your set travel limit
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={onTint || colors.textMuted} />
      </Pressable>
    );
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.header}>Top picks for you</Text>
      <Text style={styles.subheader}>
        {spots.length} spot{spots.length === 1 ? '' : 's'} • tap a name for details
      </Text>

      {/* User request: every results screen should show a map with the
          user's own location and the spots showing on that screen. */}
      {/* No separate selectedSpotId - the currently-selected spot is already
          folded into `highlights` below (see the useMemo above), with its
          own ramp-position color instead of the older flat accent glow. */}
      <SpotsMap
        location={location}
        spots={spots}
        highlights={highlights}
        onSelectSpot={(spot) => { setSelectedId(spot.id); onShowDetails(spot); }}
      />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {spots.map(renderCard)}
      </ScrollView>

      <View style={styles.actionRow}>
        <Pressable onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={18} color={colors.textDark} />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
        <Pressable onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Close</Text>
        </Pressable>
      </View>

      <FullscreenImageViewer
        visible={fullscreenPhoto !== null}
        photos={fullscreenPhoto ? [fullscreenPhoto] : []}
        onClose={() => setFullscreenPhoto(null)}
      />
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // ...buttonDepth adds the shadowColor/shadowOffset/shadowOpacity/shadowRadius
  // set iOS actually needs (bare elevation renders completely flat there) -
  // elevation re-pinned to 5 after the spread to keep this card's original
  // Android depth unchanged.
  wrapper: { width: '90%', maxHeight: '80%', alignItems: 'center', backgroundColor: colors.card, padding: 20, borderRadius: 20, ...buttonDepth, elevation: 5 },
  header: { color: colors.accent, fontSize: 24, fontWeight: '900', marginBottom: 4, letterSpacing: 1 },
  subheader: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },
  scroll: { width: '100%' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardAlt, width: '100%', padding: 10, borderRadius: 12, marginBottom: 10 },
  image: { width: 46, height: 46, borderRadius: 23, marginRight: 15 },
  imagePlaceholder: { width: 46, height: 46, borderRadius: 23, marginRight: 15, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1, justifyContent: 'center', paddingRight: 10 },
  title: { color: colors.textLight, fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  sub: { color: colors.textMuted, fontSize: 12 },
  beyondLimitText: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 1 },
  actionRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 15 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 25, marginRight: 12, ...buttonDepth },
  refreshText: { color: colors.textDark, fontWeight: 'bold', marginLeft: 8, fontSize: 15 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 18 },
  cancelText: { color: colors.danger, fontWeight: 'bold', fontSize: 15 },
});
