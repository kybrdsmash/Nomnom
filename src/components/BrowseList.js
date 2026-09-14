import React, { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { joinParts } from '../utils/format';
import FullscreenImageViewer from './FullscreenImageViewer';
import SpotsMap from './SpotsMap';

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

  const renderCard = (spot) => (
    <Pressable key={spot.id} style={styles.card} onPress={() => onShowDetails(spot)}>
      {spot.isRepeat && <View style={styles.repeatDot} />}
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
        <Text style={styles.title} numberOfLines={1}>{spot.name}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {/* Prefer the actually-confirmed cuisine (the filter that matched,
              e.g. "Mexican") over Google's own type label when both are
              known - it's the more meaningful/trustworthy one here, since
              it's tied to what was actually searched for rather than
              Google's sometimes-generic classification. Falls back to
              `type` when no cuisine filter was active (confirmedCuisine is
              null) or the spot's cuisine wasn't confirmed at all. */}
          {joinParts([`⭐ ${spot.rating}`, spot.confirmedCuisine || spot.type, spot.distance])}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <View style={styles.wrapper}>
      <Text style={styles.header}>Top picks for you</Text>
      <Text style={styles.subheader}>
        {spots.length} spot{spots.length === 1 ? '' : 's'} • tap a name for details
      </Text>

      {/* User request: every results screen should show a map with the
          user's own location and the spots showing on that screen. */}
      <SpotsMap location={location} spots={spots} onSelectSpot={onShowDetails} />

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
  repeatDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', marginRight: 10 },
  image: { width: 46, height: 46, borderRadius: 23, marginRight: 15 },
  imagePlaceholder: { width: 46, height: 46, borderRadius: 23, marginRight: 15, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1, justifyContent: 'center', paddingRight: 10 },
  title: { color: colors.textLight, fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  sub: { color: colors.textMuted, fontSize: 12 },
  actionRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 15 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 25, marginRight: 12, ...buttonDepth },
  refreshText: { color: colors.textDark, fontWeight: 'bold', marginLeft: 8, fontSize: 15 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 18 },
  cancelText: { color: colors.danger, fontWeight: 'bold', fontSize: 15 },
});
