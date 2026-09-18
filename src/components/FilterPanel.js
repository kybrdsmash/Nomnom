import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, PanResponder, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPEEDS_MPH, neonSelected, buttonDepth, accentGradient, useVerticalScale } from '../constants';
import { useTheme } from '../ThemeContext';
import SlidableSegmented from './SlidableSegmented';
import HelpModal from './HelpModal';
import FaveCuisineButton from './FaveCuisineButton';

const DIST_MAX = 20;
// No one wants to walk more than ~2 hours to eat (user feedback) - cap each
// travel mode's selectable distance at 2 hours of travel at that mode's
// speed. Transit (12mph) and drive (25mph) are already well under 2 hours
// at the 20mi ceiling, so this only actually changes anything for walking
// (3mph * 2h = 6mi) - one rule, no special-cased mode.
const MAX_TRAVEL_HOURS = 2;
const distMaxForMode = (travelType) => Math.min(DIST_MAX, SPEEDS_MPH[travelType] * MAX_TRAVEL_HOURS);

// Default travel time shown right when a mode is selected, not just a max
// cap - 10 min driving, 20 min walking (user request). Transit has no
// requested default, so it's left out and keeps the cap-only behavior below.
const DEFAULT_TRAVEL_MINUTES = { drive: 10, walk: 20 };
const defaultDistanceForMode = (travelType) => {
  const mins = DEFAULT_TRAVEL_MINUTES[travelType];
  if (mins == null) return null;
  const miles = SPEEDS_MPH[travelType] * (mins / 60);
  return Math.min(distMaxForMode(travelType), Math.round(miles * 2) / 2);
};

/**
 * Travel-type toggle, distance slider, min-rating slider, and the collapsible
 * cuisine bubble picker. Fully controlled — all state lives in the parent.
 */
export default function FilterPanel({
  travelType,
  setTravelType,
  distance,
  setDistance,
  estimatedMaxTime,
  minRating,
  setMinRating,
  showCuisines,
  setShowCuisines,
  selectedCuisines,
  onToggleCuisine,
  onCuisinesExpanded,
  cuisineTriggerRef,
  faveCuisines,
  onLoadFave,
  onSaveFave,
  onRenameFave,
}) {
  const { colors } = useTheme();
  const vscale = useVerticalScale();
  const styles = makeStyles(colors, vscale);
  const [editingTime, setEditingTime] = useState(false);
  const [timeText, setTimeText] = useState('');
  const [showCuisinesHelp, setShowCuisinesHelp] = useState(false);

  // Research-backed call (Zahavi's hypothesis / Marchetti's constant -
  // people plan travel by budgeted TIME, not distance, and a faster mode
  // just covers more ground in the same time rather than getting there
  // sooner) - the distance slider that used to sit here is gone; the
  // editable minutes field below is the only control now, and `distance`
  // is still the real underlying value everything else (places.js's search
  // radius) reads - it's just derived from typed minutes or the per-mode
  // default now, never dragged directly.
  const distMax = distMaxForMode(travelType);

  // Driving and walking jump straight to their own sensible default travel
  // time whenever that mode is selected (10 min / 20 min - user request),
  // rather than just carrying over whatever distance the last mode had.
  // Transit has no requested default, so it keeps the older behavior: only
  // pull the distance down if it no longer fits the new mode's cap (e.g.
  // was 15mi while driving, then switched to transit's lower ceiling)
  // rather than leaving it silently past the slider's own visual range.
  useEffect(() => {
    const defaultDist = defaultDistanceForMode(travelType);
    if (defaultDist != null) {
      setDistance(defaultDist);
      return;
    }
    const cap = distMaxForMode(travelType);
    if (distance > cap) setDistance(cap);
  }, [travelType]);

  const starRowRef = useRef(null);
  const starBoundsRef = useRef({ pageX: 0, width: 0 });
  const ratingFromPageX = (pageX) => {
    const { pageX: originX, width } = starBoundsRef.current;
    if (!width) return minRating;
    const ratio = Math.min(1, Math.max(0, (pageX - originX) / width));
    const raw = 1 + ratio * 4; // 5 stars spanning rating 1..5
    return Math.min(5, Math.max(1, Math.round(raw * 10) / 10));
  };
  const starPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => setMinRating(ratingFromPageX(evt.nativeEvent.pageX)),
      onPanResponderMove: (evt) => setMinRating(ratingFromPageX(evt.nativeEvent.pageX)),
    })
  ).current;

  // Converts typed minutes back into the distance the sliders/searches use.
  const commitTime = () => {
    const mins = parseInt(timeText, 10);
    if (!isNaN(mins) && mins > 0) {
      const miles = Math.min(distMax, Math.max(0.5, (mins / 60) * SPEEDS_MPH[travelType]));
      setDistance(Math.round(miles * 2) / 2);
    }
    setEditingTime(false);
  };

  return (
    <>
      <View style={styles.sliderContainer}>
        {/* Travel-type selector shrunk down and moved inline to the left of
            the time readout, rather than its own full-width row above (user
            request) - the "Travel Time:" wording is dropped too, since the
            selector sitting right next to the number already establishes
            what it's measuring. */}
        <View style={styles.travelTimeRow}>
          <SlidableSegmented
            options={[
              { value: 'drive', icon: 'car' },
              { value: 'transit', icon: 'train' },
              { value: 'bike', icon: 'bicycle' },
              { value: 'walk', icon: 'walk' },
            ]}
            value={travelType}
            onChange={setTravelType}
            styles={{
              segmented: styles.toggleRowSmall,
              segment: styles.toggleBtnSmall,
              segmentActive: styles.activeToggle,
            }}
            renderOption={(opt, active) => (
              <Ionicons name={opt.icon} size={18} color={active ? colors.textDark : colors.textLight} />
            )}
            gradientColors={accentGradient(colors).colors}
          />
          {editingTime ? (
            // 'position' behavior (not the whole main screen, which has too
            // much absolutely-positioned/animated content to safely wrap
            // wholesale) - lifts just this small row above the keyboard,
            // same targeted fix as SettingsPanel's floating panel (user
            // report: text inputs across the app getting hidden behind the
            // keyboard).
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined}>
              <View style={styles.travelTimeEditRow}>
                <TextInput
                  style={styles.timeInput}
                  value={timeText}
                  onChangeText={setTimeText}
                  keyboardType="number-pad"
                  autoFocus
                  maxLength={3}
                  onBlur={commitTime}
                  onSubmitEditing={commitTime}
                  placeholder={`${estimatedMaxTime}`}
                  placeholderTextColor="#777"
                />
                <Text style={styles.sliderLabel}> mins</Text>
              </View>
            </KeyboardAvoidingView>
          ) : (
            // Dotted underline on just the number instead of a "~" and a
            // pencil glyph - people already understand a search-radius
            // estimate isn't exact, and a subtle "this is tappable" cue
            // reads cleaner than two extra symbols (design review).
            <Pressable style={styles.travelTimeTextBtn} onPress={() => { setTimeText(''); setEditingTime(true); }}>
              <View style={styles.timeDisplayRow}>
                <Text style={styles.timeValueDotted}>{estimatedMaxTime}</Text>
                <Text style={styles.timeUnitLabel}>min</Text>
              </View>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.starContainer}>
        {/* No more standalone "Min Rating: X+ Stars" header line (user
            request - it read as redundant with the stars themselves). The
            numeric readout is now a small caption riding right at the end
            of the star row, matching the distance slider's lightweight
            "Search radius: X miles" caption above rather than a bold label
            of its own (user request: combine the two ideas). It's a
            sibling of the pan-handled star row, not nested inside it, so it
            doesn't get counted into starBoundsRef's measured width - that
            width has to stay exactly the 5 stars' span for
            ratingFromPageX's drag math to stay correct. */}
        <View style={styles.starRowWrapper}>
          <View
            ref={starRowRef}
            style={styles.starRow}
            onLayout={() => {
              starRowRef.current?.measureInWindow((pageX, _pageY, width) => {
                starBoundsRef.current = { pageX, width };
              });
            }}
            {...starPan.panHandlers}
          >
            {[1, 2, 3, 4, 5].map((star) => {
              let iconName = 'star-outline';
              if (minRating >= star) iconName = 'star';
              else if (minRating >= star - 0.5) iconName = 'star-half';
              return (
                <Ionicons key={star} name={iconName} size={28} color={colors.gold} style={{ paddingHorizontal: 2 }} />
              );
            })}
          </View>
          <Text style={styles.starCaption}>{minRating.toFixed(1)}+ stars</Text>
        </View>
      </View>

      {/* The bubble list itself now lives in CuisineDropdown.js - a frosted
          overlay anchored directly under this trigger (measured via
          cuisineTriggerRef, no gap) instead of expanding inline here, so
          this is just the trigger that opens it. Bottom corners square off
          while open so the two pieces read as one continuous panel rather
          than two stacked cards with a visible seam. */}
      <View
        ref={cuisineTriggerRef}
        collapsable={false}
        style={[styles.cuisineContainer, showCuisines && styles.cuisineContainerOpen]}
      >
        <View style={styles.cuisineHeader}>
          {/* FaveCuisineButton drives its touch handling off a raw
              PanResponder, not a Pressable (see that file's own docstring -
              it was built that way specifically to dodge the Pressable-vs-
              PanResponder responder fight this codebase has hit before,
              e.g. SlidableSegmented's history). Keeping it a sibling of the
              toggle Pressable below, rather than nesting it inside, sidesteps
              that fight entirely - each owns its own bounding box, so there's
              nothing to arbitrate. It sits here (not inside CuisineDropdown
              anymore) so a saved cuisine preset can be hot-swapped in one tap
              without ever opening the dropdown (design review). */}
          <FaveCuisineButton
            slots={faveCuisines}
            onLoad={onLoadFave}
            onSave={onSaveFave}
            onRename={onRenameFave}
            selectedCuisines={selectedCuisines}
          />
          <Pressable
            style={styles.cuisineHeaderMain}
            onPress={() => {
              const opening = !showCuisines;
              setShowCuisines(opening);
              if (opening) onCuisinesExpanded?.();
            }}
          >
            <View style={styles.cuisineHeaderLeft}>
              <Text style={styles.cuisineHeaderText}>
                Cuisines{' '}
                <Text style={styles.cuisineHeaderCount}>
                  {selectedCuisines.length > 0 ? `(${selectedCuisines.length})` : '(Any)'}
                </Text>
              </Text>
              {/* Only shown once the dropdown is actually open (user request) -
                  collapsed, this row is just the toggle; the icon would have
                  nothing to explain yet. A plain nested Pressable here is safe
                  - unlike FaveCuisineButton above, this parent is an ordinary
                  Pressable, and RN resolves nested Pressables correctly (the
                  deeper one wins a touch landing on it, the outer only ever
                  sees what lands outside it) - no responder fight, no need
                  for a sibling workaround. */}
              {showCuisines && (
                <Pressable
                  onPress={() => setShowCuisinesHelp(true)}
                  hitSlop={10}
                  style={styles.cuisineHelpBtn}
                >
                  <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            <Ionicons name={showCuisines ? 'chevron-up' : 'chevron-down'} size={24} color={colors.accent} />
          </Pressable>
        </View>
      </View>

      <HelpModal
        visible={showCuisinesHelp}
        onClose={() => setShowCuisinesHelp(false)}
        sectionId="filters"
      />
    </>
  );
}

const makeStyles = (colors, vscale = 1) => StyleSheet.create({
  // Sits inline to the left of the time readout now, not its own full-width
  // row (user request) - width fixed (not content-sized), same lesson as
  // the mode toggle/coin gesture controls: content-driven sizing risks the
  // drag math's cached width going stale. Small enough (108, 3 icon-only
  // segments) to leave room for the time text beside it.
  toggleRowSmall: { flexDirection: 'row', backgroundColor: '#333', borderRadius: 20, padding: 3, width: 132 },
  // Explicit backgroundColor (not transparent/inherited) - Android's
  // `elevation` (from buttonDepth) needs an opaque surface to clip its
  // rounded shadow against; without one it fell back to a square silhouette
  // when inactive (user feedback).
  // elevation is pinned to neonSelected's value (10) even at rest, not
  // buttonDepth's 4 - Android can make a view vanish after its `elevation`
  // changes between renders, so the active/inactive states must never
  // actually change the elevation number, only backgroundColor/border/
  // shadowColor (see the identical fix + explanation on App.js's modeBtn).
  // borderWidth pinned at 2 (transparent at rest) rather than only
  // appearing when active - same fix as App.js's modeBtn: these are flex:1
  // row siblings, and a 0->2px border jump on select nudged the whole row,
  // visibly shifting the neighboring segment.
  toggleBtnSmall: { flex: 1, marginHorizontal: 3, paddingVertical: 6, alignItems: 'center', borderRadius: 17, backgroundColor: '#333', overflow: 'hidden', ...buttonDepth, elevation: 10, borderWidth: 2, borderColor: 'transparent' },
  activeToggle: { backgroundColor: colors.accent, ...neonSelected(colors) },

  // padding/marginBottom both trimmed down from 20/15, and now also scale
  // down further on shorter screens via `vscale` (see useVerticalScale in
  // constants.js) - part of reclaiming vertical room so the Cuisines
  // trigger further down the panel has real breathing room above the
  // rolling food strip instead of sitting flush against it, on ANY device
  // rather than just the one this was last tuned against (user request,
  // after an Android elevation-based fix wasn't reliable enough on its own -
  // see RollingFoodStrip.js/App.js history). Touch targets (distTouchArea's
  // own paddingVertical below) deliberately aren't scaled - only decorative
  // spacing shrinks, never tappable area.
  sliderContainer: { alignItems: 'center', backgroundColor: colors.card, padding: 14 * vscale, borderRadius: 15, width: '85%', marginBottom: 10 * vscale },
  travelTimeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 * vscale },
  travelTimeEditRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 12 },
  travelTimeTextBtn: { marginLeft: 12 },
  sliderLabel: { color: colors.textLight, fontSize: 18, fontWeight: 'bold' },
  timeInput: { color: colors.gold, fontSize: 18, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: colors.accent, minWidth: 44, textAlign: 'center', padding: 0 },
  // Replaces the old "~X mins ✎" text - a dotted underline on just the
  // number instead of a tilde + pencil (design review).
  timeDisplayRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  timeValueDotted: { color: colors.textLight, fontSize: 18, fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: colors.accent, borderStyle: 'dotted', paddingBottom: 1 },
  timeUnitLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  starContainer: { alignItems: 'center', backgroundColor: colors.card, padding: 14 * vscale, borderRadius: 15, width: '85%', marginBottom: 10 * vscale },
  starRowWrapper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  starRow: { flexDirection: 'row', paddingVertical: 10 },
  // Same look as distCaptionInline (the search radius readout) - a muted,
  // small readout rather than a bold header, riding right at the
  // star row's end instead of on its own line.
  starCaption: { color: colors.textMuted, fontSize: 14, marginLeft: 8 },

  // marginBottom scales with vscale too - this is the gap immediately
  // above the rolling food strip, so it's the most direct lever for keeping
  // real breathing room between them on shorter screens. cuisineHeader's own
  // padding below stays fixed - that's the trigger's tap target, not
  // decorative spacing.
  cuisineContainer: { width: '85%', backgroundColor: colors.card, borderRadius: 15, overflow: 'hidden', marginBottom: 15 * vscale },
  cuisineContainerOpen: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  // Plain row now, not itself a Pressable - FaveCuisineButton and the toggle
  // Pressable below are touch siblings inside it (see the comment where
  // they render for why). paddingLeft carries the trigger's old left inset;
  // paddingRight is trimmed since FaveCuisineButton already has its own
  // right-side padding for the dot indicator.
  cuisineHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, paddingLeft: 20, paddingRight: 12 },
  // The actual toggle - everything that used to be cuisineHeader's own
  // content, now just this Pressable's, with the button taking the space
  // to its left instead of padding.
  cuisineHeaderMain: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginLeft: 12 },
  cuisineHeaderLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  cuisineHeaderText: { color: colors.textLight, fontSize: 18, fontWeight: 'bold' },
  cuisineHeaderCount: { color: colors.textMuted, fontSize: 15, fontWeight: '400' },
  cuisineHelpBtn: { marginLeft: 6, padding: 2 },
});
