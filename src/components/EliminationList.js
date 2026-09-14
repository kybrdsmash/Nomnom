import React, { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth, neonSelected } from '../constants';
import { joinParts } from '../utils/format';
import FullscreenImageViewer from './FullscreenImageViewer';
import SpotsMap from './SpotsMap';

// SpotsMap's own fixed height (160) plus its marginBottom (12) - subtracted
// from the scroll area's budget below so adding the map doesn't just push
// the card list back into needing a scroll again (user request for the map
// landed right after the scroll-fit fix, so this keeps both intact together).
const MAP_HEIGHT = 172;

/**
 * The 5-item bracket the user taps through to eliminate spots down to a
 * winner. Renders the FULL original bracket (fullBracket) for the whole
 * game, not just the still-active ones - eliminated spots stay in place,
 * greyed out and struck through, instead of disappearing (user feedback:
 * "what was previously showing should still be there, just inactive").
 * Eliminated status is derived from eliminatedStack (already tracked in
 * App.js for Undo) rather than needing its own prop.
 */
export default function EliminationList({ eliminationList, fullBracket, eliminatedStack, location, onEliminate, onUndo, onCancel, onPickForMe, onShowDetails }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const eliminatedIds = new Set(eliminatedStack.map((s) => s.id));
  const displayList = fullBracket && fullBracket.length > 0 ? fullBracket : eliminationList;
  // Which spot's photo is blown up fullscreen, if any - one shared piece of
  // state for the whole list rather than per-row, since only one can be
  // open at a time anyway.
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  // Glows the matching map pin AND list row when either is tapped - same
  // pattern (and reasoning) as FriendSpin's own bracket + FriendMap pairing.
  const [selectedSpotId, setSelectedSpotId] = useState(null);

  // A plain `flex: 1` on the ScrollView (tried first) needs an ANCESTOR with
  // a definite (not just maxHeight-capped, auto-sized) height to expand
  // against - eliminationWrapper here has neither, so the ScrollView
  // collapsed toward zero height instead of growing, breaking the whole
  // screen. Computing an actual pixel cap from the real screen height avoids
  // that flexbox pitfall entirely while still adapting per device (user
  // request: fit all 5 without scrolling on most phones) rather than the
  // old hardcoded 380.
  const { height: windowHeight } = useWindowDimensions();
  const scrollMaxHeight = Math.max(260, Math.round(windowHeight * 0.55) - MAP_HEIGHT);

  return (
    <View style={styles.eliminationWrapper}>
      <Text style={styles.eliminationHeader}>Last one standing wins!</Text>
      <Text style={styles.eliminationSubheader}>Tap ✕ to eliminate • tap a name for details</Text>

      {/* User request: every results screen should show a map with the
          user's own location and the spots showing on that screen. */}
      <SpotsMap
        location={location}
        spots={displayList}
        eliminatedIds={[...eliminatedIds]}
        selectedSpotId={selectedSpotId}
        onSelectSpot={(spot) => { setSelectedSpotId(spot.id); onShowDetails(spot); }}
      />

      <ScrollView
        style={[styles.elimScroll, { maxHeight: scrollMaxHeight }]}
        showsVerticalScrollIndicator={false}
      >
        {displayList.map((spot) => {
          const isEliminated = eliminatedIds.has(spot.id);
          return (
            <Pressable
              key={spot.id}
              style={[
                styles.elimCard,
                isEliminated && styles.elimCardOut,
                spot.id === selectedSpotId && styles.elimCardSelected,
              ]}
              onPress={() => { setSelectedSpotId(spot.id); onShowDetails(spot); }}
            >
              {spot.isRepeat && <View style={styles.repeatDot} />}
              {spot.photoUrl ? (
                <Pressable onPress={() => setFullscreenPhoto(spot.photoUrl)}>
                  <Image source={{ uri: spot.photoUrl }} style={styles.elimImage} />
                </Pressable>
              ) : (
                <View style={styles.elimImagePlaceholder}>
                  <Ionicons name="restaurant" size={20} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.elimTextCol}>
                <Text style={[styles.elimTitle, isEliminated && styles.elimTitleOut]} numberOfLines={1}>
                  {spot.name}
                </Text>
                <Text style={styles.elimSub} numberOfLines={1}>{joinParts([`⭐ ${spot.rating}`, spot.type])}</Text>
                {/* Only set when this slot wasn't a genuine match for the
                    selected cuisine (see places.js's unconfirmedCuisine) -
                    a bracket gives the least context of any result screen
                    for why an odd spot showed up, so it needs this flagged
                    even more than a single-pick reveal does. */}
                {spot.unconfirmedCuisine && (
                  <Text style={styles.elimUnconfirmed} numberOfLines={1}>
                    {spot.unconfirmedCuisine} Spots Nearby
                  </Text>
                )}
              </View>
              {!isEliminated && (
                <Pressable onPress={() => onEliminate(spot.id)} hitSlop={10} style={styles.eliminateBtn}>
                  <Ionicons name="close" size={20} color={colors.danger} />
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable onPress={onPickForMe} style={styles.pickForMeBtn}>
        <Text style={styles.pickForMeText}>🎲 Nevermind — pick for me</Text>
      </Pressable>

      <View style={styles.elimActionRow}>
        <Pressable
          onPress={onUndo}
          style={[styles.abortButton, { opacity: eliminatedStack.length ? 1 : 0.4 }]}
          disabled={eliminatedStack.length === 0}
        >
          <Text style={[styles.abortText, { color: colors.accent }]}>↺ Undo</Text>
        </Pressable>

        <Pressable onPress={onCancel} style={styles.abortButton}>
          <Text style={styles.abortText}>Cancel Game</Text>
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
  eliminationWrapper: { width: '90%', alignItems: 'center', backgroundColor: colors.card, padding: 20, borderRadius: 20, ...buttonDepth, elevation: 5 },
  eliminationHeader: { color: colors.accent, fontSize: 24, fontWeight: '900', marginBottom: 4, letterSpacing: 1 },
  eliminationSubheader: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },
  // maxHeight is applied inline (see scrollMaxHeight above) - computed from
  // the real screen height rather than a static value here.
  elimScroll: { width: '100%' },
  // elevation pinned constant (10, matching neonSelected's) whether selected
  // or not - same fix as App.js's modeBtn/FilterPanel's toggleBtnSmall/
  // ResultCard's iconBtn: Android can leave a view stuck blank after its
  // elevation changes between renders (this row had none at rest -> 10 once
  // selected/synced with the map pin, exactly that jump). Only the glow/
  // border from neonSelected differs between states now.
  elimCard: { flexDirection: 'row', backgroundColor: colors.cardAlt, width: '100%', padding: 10, borderRadius: 12, marginBottom: 10, alignItems: 'center', elevation: 10 },
  // Greyed out, not removed - the row itself stays put so the whole bracket
  // is still visible after an elimination, just visibly "crossed out".
  elimCardOut: { opacity: 0.45 },
  elimCardSelected: { ...neonSelected(colors) },
  elimTitleOut: { textDecorationLine: 'line-through' },
  elimImage: { width: 46, height: 46, borderRadius: 23, marginRight: 15 },
  elimImagePlaceholder: { width: 46, height: 46, borderRadius: 23, marginRight: 15, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' },
  elimTextCol: { flex: 1, justifyContent: 'center', paddingRight: 10 },
  elimTitle: { color: colors.textLight, fontSize: 17, fontWeight: 'bold', marginBottom: 2 },
  elimSub: { color: colors.textMuted, fontSize: 13 },
  elimUnconfirmed: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  repeatDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', marginRight: 10 },
  eliminateBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.cardAlt, borderWidth: 1.5, borderColor: colors.danger, ...buttonDepth,
  },
  elimActionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 15, paddingHorizontal: 10 },
  pickForMeBtn: { marginTop: 12, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.accent, borderRadius: 25, paddingVertical: 10, paddingHorizontal: 22, ...buttonDepth },
  pickForMeText: { color: colors.accent, fontWeight: 'bold', fontSize: 15 },
  abortButton: { padding: 10 },
  abortText: { color: colors.danger, fontWeight: 'bold', fontSize: 16 },
});
