import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Image, Animated, Easing, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { neonSelected, buttonDepth } from '../constants';
import { useTheme } from '../ThemeContext';
import { joinParts } from '../utils/format';
import FullscreenImageViewer from './FullscreenImageViewer';
import SpotsMap from './SpotsMap';
import CuisineMatchBadge from './CuisineMatchBadge';
import { BOTTOM_NAV_CLEARANCE } from './BottomNav';

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
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors);
  const [fullscreen, setFullscreen] = useState(false);

  // "Flip Again" now fetches a new spot and swaps `result` in place instead
  // of leaving this screen (user request) - this card stays mounted the
  // whole time, so an instant photo swap would just be a jarring cut. A
  // real card-flip instead: rotate the photo to 90deg (edge-on, invisible),
  // swap the photo source at that exact moment, then continue from -90deg
  // back to 0 (NOT onward to 180 - a flat image rotated past 90 the normal
  // way renders mirrored, since the "back" of the card is being viewed;
  // jumping the driving value to -90 lands on the same edge-on angle with
  // no visible pop, and animating -90->0 reveals the new photo the right
  // way round). Only the photo does this - the rest of the card's text/
  // icons just re-render normally on the new `result` prop, which reads as
  // fine since none of that changes are as visually jarring as a photo cut.
  const [displayPhotoUrl, setDisplayPhotoUrl] = useState(result.photoUrl);
  const photoFlip = useRef(new Animated.Value(0)).current;
  const prevResultId = useRef(result.id);
  // Set when the user confirms "Yes, it is {cuisine}" on this exact result -
  // CuisineMatchBadge only logs that vote to Firestore for later filter
  // tuning, it never touches what THIS card shows, so confirming left the
  // type label sitting blank/unconfirmed even seconds after saying yes
  // (user report). Reset on every new result below, same as the photo flip.
  const [confirmedType, setConfirmedType] = useState(null);

  useEffect(() => {
    if (result.id === prevResultId.current) return;
    prevResultId.current = result.id;
    setConfirmedType(null);
    Animated.timing(photoFlip, {
      toValue: 90, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true,
    }).start(() => {
      setDisplayPhotoUrl(result.photoUrl);
      photoFlip.setValue(-90);
      Animated.timing(photoFlip, {
        toValue: 0, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }).start();
    });
  }, [result.id]);

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

        <Text style={styles.foodName}>{result.name}</Text>
        <Text style={styles.details}>{joinParts([`⭐ ${result.rating}`, confirmedType || result.type])}</Text>
        <Text style={styles.blurbText}>{result.blurb}</Text>
        {/* Only set when this spot was NOT a genuine match for the selected
            cuisine - Google had zero real matches nearby, so this is the
            closest option instead (see places.js's unconfirmedCuisine). Never
            silently present a fallback result as if it were a real match.
            Was flat "No {Cuisine} Match Nearby" text - read as "there's
            nothing here" while looking straight at a real result, especially
            confusing on a Flip Again reroll after already seeing genuine
            matches earlier in the same search (user feedback: "kinda doesn't
            feel right" unless it's literally the first result). Now asks
            instead of asserts, and the answer becomes free crowdsourced
            signal for tuning the filter later - see CuisineMatchBadge. */}
        {/* Keyed by spotId - CuisineMatchBadge keeps its own yes/no vote
            state locally, and without a key React just reuses the same
            instance across a Flip Again reroll, leaving the PREVIOUS
            spot's "Thanks - noted..." message stuck on screen for a
            completely different result (user report). A key change forces
            a fresh instance (and fresh state) per spot, same as any other
            per-item React state reset. */}
        {result.unconfirmedCuisine && (
          <CuisineMatchBadge
            key={result.id}
            cuisine={result.unconfirmedCuisine}
            spotId={result.id}
            spotName={result.name}
            onConfirmed={(cuisine) => setConfirmedType(cuisine.toUpperCase())}
          />
        )}
        {/* Favorites-only mode reaching past the distance setting to still
            offer a real choice (see places.js's pickFromFavorites) - always
            says so, rather than quietly serving something outside the
            limit the user actually set (user request). */}
        {result.beyondLimit && (
          <View style={styles.unconfirmedBadge}>
            <Ionicons name="navigate-outline" size={14} color={colors.textMuted} />
            <Text style={styles.unconfirmedText}>Beyond your set travel limit</Text>
          </View>
        )}

        {displayPhotoUrl && (
          // Was onPress -> fullscreen photo viewer - now opens the detail
          // page instead (user request: "when a user clicks on the result
          // picture - it goes to the detailed info page"), freeing the
          // icon row below of its own separate info button. Fullscreen
          // photo view isn't gone, just demoted to a long-press so nothing
          // that worked before stops working.
          <Pressable onPress={onShowDetails} onLongPress={() => setFullscreen(true)}>
            <Animated.View
              style={{
                transform: [
                  { perspective: 800 },
                  { rotateY: photoFlip.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) },
                ],
              }}
            >
              <Image source={{ uri: displayPhotoUrl }} style={styles.foodImage} resizeMode="cover" />
              {/* Small visual hint that the photo itself opens details -
                  bottom-right per thumb-zone research (Hoober's UXmatters
                  study: bottom-right is the reachable "green zone" for
                  one-handed use; top corners are the hardest to reach) and
                  standard badge-corner convention when there's no separate
                  footer to attach it to. */}
              <View style={styles.photoInfoBadge} pointerEvents="none">
                <Ionicons name="information-circle" size={20} color="#FFF" />
              </View>
            </Animated.View>
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
          {/* Was a separate "i in a circle" info button - removed now that
              the photo itself opens details (see the photo Pressable above),
              which frees this slot for the friend-invite icon to actually
              be the second thing people see, not something tucked after an
              info button that did the same job the photo now does (user
              request: "the information icon gets replaced with a friends
              icon"). Solo-mode only (not gated on gameMode==='friend',
              which already has its own schedule/calendar icon for the
              CURRENT partner below) - "invite a friend to THIS spot" for a
              result found without a friend already in the loop. Only
              rendered where the caller actually wires up InviteFriendModal
              (user request). */}
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
      {/* BottomNav persists over the Feast screen (not solo mode's result
          view, where it's deliberately hidden during a result - see
          App.js's showFab) - the extra clearance only applies in friend
          mode so solo's own already-tuned marginBottom is untouched (user
          report: "Try again" partially hidden by the bottom bar on the
          Feast results page). */}
      <View style={[styles.resultActionRow, gameMode === 'friend' && { marginBottom: insets.bottom + 76 + BOTTOM_NAV_CLEARANCE }]}>
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
  // Bottom-right - see the comment where this renders for the thumb-zone/
  // badge-convention research behind that choice. A soft dark backing
  // (not just a bare icon) keeps the white glyph readable over any photo,
  // bright or dark.
  photoInfoBadge: {
    position: 'absolute', bottom: 8, right: 8, width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
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
