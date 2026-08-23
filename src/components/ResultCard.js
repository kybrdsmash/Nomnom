import React, { useState } from 'react';
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { neonSelected, buttonDepth } from '../constants';
import { useTheme } from '../ThemeContext';
import { joinParts } from '../utils/format';
import FullscreenImageViewer from './FullscreenImageViewer';
import SpotsMap from './SpotsMap';

// Was an inline ternary chain that defaulted to 'car' for anything that
// wasn't 'walk'/'transit' - silently mislabeling 'bike' as driving once that
// travel type was added (src/constants.js's SPEEDS_MPH) rather than erroring,
// which was easy to miss. An explicit map with a fallback makes an
// unrecognized travel type obvious instead of silently wrong.
const TRAVEL_ICONS = { walk: 'walk', bike: 'bicycle', transit: 'bus', drive: 'car' };

/**
 * The final "winner" screen shown after a randomizer spin, a finished
 * Elimination round, or a finished friend-spin round (gameMode 'friend') -
 * same layout across all three so switching modes doesn't feel like a
 * different app. Friend mode's action row used to be Let's go! / Veto /
 * Restart (3 buttons) - now just one, "Try Again" (Restart's fetch-a-new-
 * bracket action, relabeled) - user request: Veto "isn't really going to be
 * used", and Let's go! wasn't needed either once Veto was already going.
 */
export default function ResultCard({
  result,
  gameMode,
  location,
  isFavorite,
  onToggleFavorite,
  isTryLater,
  onToggleTryLater,
  onOpenMaps,
  canUndo,
  onUndo,
  onReset,
  onShowDetails,
  onBackToBracket,
  onReroll,  // friend mode: "Try Again" - fetch a whole new bracket
  onOpenSchedule,   // friend mode: opens the "schedule the meal" chat/picker modal
  scheduleLocked,   // friend mode: true once both people have locked in a time - makes the badge glow
  hasUnreadMessage, // friend mode: true if the other person sent a chat message you haven't opened yet
  onOpenInvite,     // opens InviteFriendModal for this result - omitted entirely if the caller doesn't support it
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [fullscreen, setFullscreen] = useState(false);

  // This card used to have no scroll container at all - just sat inside
  // App.js's full-screen centered view, so content taller than the screen
  // silently clipped off-screen (no way to reach it) rather than scrolling.
  // A plain ScrollView fixed that, but with Flip Again/Back to list living
  // INSIDE the scrollable content, enough top padding (user requests to push
  // everything down) could bury them below the fold with no visible hint to
  // scroll for them (user report: "can't see the return to previous screen
  // anymore"). Split instead: the action row is a fixed footer, outside the
  // ScrollView, always visible regardless of how tall the scrollable content
  // above it gets. That split needs a DEFINITE height on the outer container
  // for the ScrollView's flex:1 to size against - a maxHeight-only
  // (auto-sized) ancestor doesn't give a flex child anything real to expand
  // into and it collapses instead (see EliminationList's history with that
  // exact bug).
  //
  // The outer wrapper itself used to compute that definite height as a flat
  // 90% of the raw window height - correct in App.js's full-screen centered
  // overlay (nothing else shares that space), but wrong in FriendSpin.js's
  // "Feast with Friends" screen, which renders this SAME component below its
  // own Header - 90% of the FULL window height starting partway down the
  // screen pushed the fixed footer below the visible area entirely (user
  // report: bottom buttons "half off the screen"). `flex: 1` instead just
  // fills whatever room this component's ACTUAL parent leaves it, which
  // works correctly in both real call sites - App.js's absoluteCenter and
  // FriendSpin.js's screen are both genuinely full-screen (position:
  // absolute, top/bottom: 0), so flex:1 here resolves against a real
  // definite height either way, unlike the EliminationList case where the
  // ancestor was only maxHeight-capped, not actually definite.
  return (
    <View style={{ flex: 1, width: '100%', alignItems: 'center' }}>
      {/* User request: every results screen should show a map with the
          user's own location and the spot(s) it's showing - single spot
          here, same SpotsMap component the bracket/list screens use. Fixed
          above the ScrollView (not inside it) for two reasons: it's meant to
          stay pinned at the very top regardless of scrolling (user request -
          title and everything else reads BELOW the map), and a MapView
          nested inside a ScrollView is a known trouble spot for
          react-native-maps - marker rendering (the person pin specifically,
          user report) can silently fail in that combination. EliminationList
          and BrowseList already put theirs above their own scroll areas the
          same way. */}
      <View style={styles.mapWrapper}>
        <SpotsMap location={location} spots={[result]} />
      </View>

      <ScrollView
        style={{ flex: 1, width: '100%' }}
        contentContainerStyle={styles.resultBox}
        showsVerticalScrollIndicator={false}
      >
        {gameMode === 'friend' && <Text style={styles.winnerHeader}>YOU BOTH GOT…</Text>}

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {result.isRepeat && <View style={styles.repeatDot} />}
          <Text style={styles.foodName}>{result.name}</Text>
        </View>
        <Text style={styles.details}>{joinParts([`⭐ ${result.rating}`, result.type])}</Text>
        <Text style={styles.blurbText}>{result.blurb}</Text>
        {/* Only set when this spot was NOT a genuine match for the selected
            cuisine - Google had zero real matches nearby, so this is the
            closest option instead (see places.js's unconfirmedCuisine). Never
            silently present a fallback result as if it were a real match. */}
        {result.unconfirmedCuisine && (
          <View style={styles.unconfirmedBadge}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.unconfirmedText}>{result.unconfirmedCuisine} Spots Nearby</Text>
          </View>
        )}

        {result.photoUrl && (
          <Pressable onPress={() => setFullscreen(true)}>
            <Image source={{ uri: result.photoUrl }} style={styles.foodImage} resizeMode="cover" />
          </Pressable>
        )}
        <FullscreenImageViewer
          visible={fullscreen}
          photos={result.photoUrl ? [result.photoUrl] : []}
          onClose={() => setFullscreen(false)}
        />

        <View style={styles.iconRow}>
          <Pressable style={styles.iconBtn} onPress={onToggleFavorite}>
            <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={24} color={colors.danger} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={onToggleTryLater}>
            <Ionicons name={isTryLater ? 'bookmark' : 'bookmark-outline'} size={24} color={colors.gold} />
          </Pressable>
          {/* Was 3 dots (ellipsis-horizontal) - user request: an "i in a
              circle" reads more clearly as "details/info". Same icon this
              file already uses for the unconfirmedCuisine badge above,
              which keeps "info" meaning one consistent icon throughout. */}
          <Pressable style={styles.iconBtn} onPress={onShowDetails}>
            <Ionicons name="information-circle-outline" size={24} color={colors.accent} />
          </Pressable>
          {/* Solo-mode only (not gated on gameMode==='friend', which already
              has its own schedule/calendar icon for the CURRENT partner
              below) - "invite a friend to THIS spot" for a result found
              without a friend already in the loop. Only rendered where the
              caller actually wires up InviteFriendModal (user request). */}
          {onOpenInvite && (
            <Pressable style={styles.iconBtn} onPress={onOpenInvite}>
              <Ionicons name="paper-plane-outline" size={22} color={colors.accent} />
            </Pressable>
          )}
          {gameMode === 'friend' && (
            <Pressable
              style={[styles.iconBtn, scheduleLocked && styles.iconBtnGlow]}
              onPress={onOpenSchedule}
            >
              <Ionicons name="calendar" size={24} color={scheduleLocked ? colors.textDark : colors.accent} />
              {hasUnreadMessage && <View style={styles.unreadDot} />}
            </Pressable>
          )}
        </View>

        <Pressable style={styles.logisticsBadge} onPress={onOpenMaps}>
          <Ionicons
            name={TRAVEL_ICONS[result.travel] || 'car'}
            size={18}
            color={colors.textDark}
          />
          <Text style={styles.logisticsText}>{result.distance} ({result.time})</Text>
          <Ionicons name="navigate" size={16} color={colors.textDark} style={{ marginLeft: 6 }} />
        </Pressable>
      </ScrollView>

      {/* Fixed footer, outside the ScrollView above - always visible no
          matter how tall the scrollable content gets (see the comment on
          cardHeight/the outer wrapper for why). */}
      <View style={styles.resultActionRow}>
        {gameMode === 'friend' ? (
          <Pressable onPress={onReroll} style={styles.friendPrimaryBtn}>
            <Text style={styles.friendPrimaryText}>Try Again 🔄</Text>
          </Pressable>
        ) : (
          <>
            {gameMode === 'elimination' && canUndo && (
              <Pressable onPress={onBackToBracket} style={styles.undoResButton}>
                <Text style={styles.undoResText}>⬅ Back to list</Text>
              </Pressable>
            )}
            {/* Matches BrowseList's Refresh button (Curated results page) -
                same accent pill + icon, user request. */}
            <Pressable onPress={onReset} style={styles.resetButton}>
              <Ionicons name="refresh" size={18} color={colors.textDark} />
              <Text style={styles.resetText}>Flip Again</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // paddingTop here (not on resultBox below) is what pushes the whole card
  // down from the top of the screen now that SpotsMap moved outside the
  // ScrollView (see the comment where it's rendered) - originally ~0.5in/
  // ~12mm = 48dp (RN's dp uses the same 96-DPI reference CSS/inches do),
  // then +10mm more (~38dp) per a follow-up request - 48 + 38 = 86dp total.
  // paddingHorizontal matches resultBox's own so the map lines up with the
  // content below it.
  mapWrapper: { width: '100%', paddingHorizontal: 20, paddingTop: 86 },
  // paddingTop added (~1cm = 38dp, same conversion as mapWrapper above) to
  // push the result details (name/rating/blurb/photo) down away from the
  // map (user request).
  resultBox: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 38 },
  winnerHeader: { color: colors.accent, fontSize: 22, fontWeight: '900', marginBottom: 10, letterSpacing: 2 },
  foodImage: { width: 220, height: 140, borderRadius: 15, marginTop: 14, borderWidth: 2, borderColor: colors.accentDark, backgroundColor: '#333' },
  // Favorite/Try later/Details (and, in friend mode, Schedule) now live in a
  // row below the photo instead of stacked as absolute badges over its
  // corners - user feedback: title/rating/photo read better top-to-bottom
  // as one block, with actions as a clear separate row underneath.
  iconRow: { flexDirection: 'row', marginTop: 14 },
  // elevation is constant (10) whether glowing or not, same reasoning as
  // the mode toggle / travel toggle fix - Android can make a view vanish
  // after its `elevation` changes between renders.
  iconBtn: { backgroundColor: colors.card, borderRadius: 22, padding: 10, marginHorizontal: 6, ...buttonDepth, elevation: 10 },
  iconBtnGlow: { backgroundColor: colors.accent, ...neonSelected(colors) },
  unreadDot: {
    position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5,
    backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.card,
  },
  foodName: { fontSize: 32, fontWeight: 'bold', color: colors.textLight, textAlign: 'center' },
  details: { fontSize: 18, color: '#CCC', marginTop: 4 },
  repeatDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF', marginRight: 10 },
  blurbText: { color: colors.accent, fontStyle: 'italic', textAlign: 'center', marginTop: 6, paddingHorizontal: 10, fontSize: 15 },
  unconfirmedBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10 },
  unconfirmedText: { color: colors.textMuted, fontSize: 12, marginLeft: 4, textAlign: 'center' },
  logisticsBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25, marginTop: 18, ...buttonDepth },
  logisticsText: { color: colors.textDark, marginLeft: 8, fontSize: 16, fontWeight: 'bold' },
  // marginTop used to be 40 (a spacer within the scrollable flow, right
  // after logisticsBadge) - now that this row is a fixed footer sibling of
  // the ScrollView (not inside it), that big a gap isn't needed; a modest
  // paddingTop/Bottom keeps a little breathing room from the scroll content
  // above and the screen edge below instead.
  // marginBottom added (~1cm = 38dp, same 96-DPI conversion as mapWrapper's
  // paddingTop above) to lift the row up off the bottom edge - it sits right
  // after the flex:1 ScrollView with nothing else below it, so it was
  // effectively pinned flush to the screen's bottom edge (user request: "too
  // low"). Bumped again to 76 (+38 more) per a follow-up request to move it
  // up another 1cm.
  resultActionRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 10, marginBottom: 76 },
  undoResButton: { marginRight: 15, paddingVertical: 14, paddingHorizontal: 20, backgroundColor: colors.card, borderRadius: 30, borderWidth: 1, borderColor: '#555', ...buttonDepth },
  undoResText: { color: colors.accent, fontWeight: 'bold', fontSize: 16 },
  // Matches BrowseList's refreshBtn/refreshText exactly (user request: "the
  // same as the refresh button on the curated results page") - accent pill
  // with an icon, not the old plain dark button.
  resetButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 12, paddingHorizontal: 22, borderRadius: 25, ...buttonDepth },
  resetText: { color: colors.textDark, fontWeight: 'bold', marginLeft: 8, fontSize: 15 },
  friendPrimaryBtn: { paddingVertical: 14, paddingHorizontal: 22, backgroundColor: colors.accent, borderRadius: 30, ...buttonDepth },
  friendPrimaryText: { color: colors.textDark, fontWeight: 'bold', fontSize: 15 },
});
