import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, PanResponder, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SPEEDS_MPH, neonSelected, buttonDepth, accentGradient, useVerticalScale } from '../constants';
import { useTheme } from '../ThemeContext';
import SlidableSegmented from './SlidableSegmented';

const DIST_MIN = 0.5;
const DIST_MAX = 20;
const MI_TO_KM = 1.60934;
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
  units = 'mi',
}) {
  const { colors } = useTheme();
  const vscale = useVerticalScale();
  const styles = makeStyles(colors, vscale);
  const [editingTime, setEditingTime] = useState(false);
  const [timeText, setTimeText] = useState('');

  // Distance and star-rating both use the same tap-or-drag-directly-on-it
  // pattern (no separate @react-native-community/slider) - one interactive
  // element per control, so there's no touchable-vs-parent-responder race
  // (see SlidableSegmented's history with that exact bug). The old Slider
  // for distance had minimumValue=0.5 with step=1, so EVERY reachable value
  // was X.5 (0.5, 1.5, 2.5...) - it could never land on a whole mile or any
  // other .5 multiple. This snaps to the nearest 0.5 directly instead.
  const distRowRef = useRef(null);
  const distBoundsRef = useRef({ pageX: 0, width: 0 });
  // Drives the fill/dial's own position with a measured pixel width rather
  // than a percentage string - percentage-based `left` on an absolutely
  // positioned view has historically been an unreliable RN layout path
  // (looked visibly shifted/misaligned - user feedback).
  const [trackWidth, setTrackWidth] = useState(0);
  const distMax = distMaxForMode(travelType);
  const distanceFromPageX = (pageX) => {
    const { pageX: originX, width } = distBoundsRef.current;
    if (!width) return distance;
    const ratio = Math.min(1, Math.max(0, (pageX - originX) / width));
    const raw = DIST_MIN + ratio * (distMax - DIST_MIN);
    return Math.min(distMax, Math.max(DIST_MIN, Math.round(raw * 2) / 2));
  };

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

  // PanResponder.create() only ever runs once (useRef freezes it after the
  // first render), so its callbacks can't just call `distanceFromPageX`
  // directly - that would permanently close over the FIRST render's
  // `distMax` (whatever travelType was on mount), while the dial's on-screen
  // position is computed from the CURRENT render's distMax every time. For
  // walk mode specifically (a much smaller cap than the mount-time default)
  // that mismatch let a drag push `distance` past walk's real max, so the
  // computed dial position landed far outside the visible track - looked
  // like the dial vanished. Same stale-closure bug as CoinSpinner's flick
  // handler and SlidableSegmented's drag math; same fix - route through a
  // ref reassigned every render.
  const distanceFromPageXRef = useRef(distanceFromPageX);
  distanceFromPageXRef.current = distanceFromPageX;

  const distPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => setDistance(distanceFromPageXRef.current(evt.nativeEvent.pageX)),
      onPanResponderMove: (evt) => setDistance(distanceFromPageXRef.current(evt.nativeEvent.pageX)),
    })
  ).current;

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

  const distPct = ((distance - DIST_MIN) / (distMax - DIST_MIN)) * 100;

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
          ) : (
            <Pressable style={styles.travelTimeTextBtn} onPress={() => { setTimeText(''); setEditingTime(true); }}>
              <Text style={styles.sliderLabel}>
                ~{estimatedMaxTime} mins <Text style={styles.editHint}>✎</Text>
              </Text>
            </Pressable>
          )}
        </View>
        {/* Search radius readout moved inline to the right of the slider
            instead of its own line underneath (user request - reclaims a
            full text row of vertical height, part of freeing up room so the
            Cuisines trigger further down never gets pinched against the
            rolling food strip on shorter screens). Fixed width + right
            alignment so digit-count changes (0.5 vs 20) don't nudge the
            slider's own width, which distBoundsRef's measured pageX/width
            depends on. */}
        <View style={styles.distRow}>
          <View
            ref={distRowRef}
            style={styles.distTouchArea}
            onLayout={(e) => {
              setTrackWidth(e.nativeEvent.layout.width);
              distRowRef.current?.measureInWindow((pageX, _pageY, width) => {
                distBoundsRef.current = { pageX, width };
              });
            }}
            {...distPan.panHandlers}
          >
            <View style={styles.distTrack}>
              {/* Same glossy diagonal gradient as the coin (accentGradient in
                  constants.js) - user request, after liking it there. */}
              <LinearGradient
                {...accentGradient(colors)}
                style={[styles.distFill, { width: (distPct / 100) * trackWidth }]}
              />
            </View>
            <LinearGradient
              {...accentGradient(colors)}
              style={[styles.distDial, { left: (distPct / 100) * trackWidth - 14 }]}
            />
          </View>
          <Text style={styles.distCaptionInline}>
            {(units === 'km' ? distance * MI_TO_KM : distance).toFixed(1)} {units === 'km' ? 'km' : 'mi'}
          </Text>
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
        <Pressable
          style={styles.cuisineHeader}
          onPress={() => {
            const opening = !showCuisines;
            setShowCuisines(opening);
            if (opening) onCuisinesExpanded?.();
          }}
        >
          <Text style={styles.cuisineHeaderText}>
            Cuisines{' '}
            <Text style={styles.cuisineHeaderCount}>
              {selectedCuisines.length > 0 ? `(${selectedCuisines.length})` : '(Any)'}
            </Text>
          </Text>
          <Ionicons name={showCuisines ? 'chevron-up' : 'chevron-down'} size={24} color={colors.accent} />
        </Pressable>
      </View>
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
  editHint: { color: colors.accent, fontSize: 14 },
  timeInput: { color: colors.gold, fontSize: 18, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: colors.accent, minWidth: 44, textAlign: 'center', padding: 0 },
  distRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  distTouchArea: { flex: 1, paddingVertical: 14, justifyContent: 'center' },
  // Fixed width (not content-hugging) so "0.5 mi" vs "20.0 mi" never
  // changes how much room distTouchArea gets, which would otherwise shift
  // trackWidth/distBoundsRef's measured width mid-use.
  distCaptionInline: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginLeft: 10, width: 60, textAlign: 'right' },
  distTrack: { height: 8, borderRadius: 4, backgroundColor: colors.cardAlt, width: '100%', overflow: 'hidden' },
  distFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, backgroundColor: colors.accent },
  // top is a fixed pixel offset, not a percentage - percentage-based `top`
  // on an absolutely positioned view was the source of the mispositioning
  // (distTouchArea's height is paddingVertical:14*2 + distTrack's 8, so its
  // vertical center sits 18px down; offsetting by the dial's own half-height
  // centers it exactly).
  distDial: {
    position: 'absolute', top: 18 - 14,
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, overflow: 'hidden',
    ...neonSelected(colors),
  },

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
  cuisineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  cuisineHeaderText: { color: colors.textLight, fontSize: 18, fontWeight: 'bold' },
  cuisineHeaderCount: { color: colors.textMuted, fontSize: 15, fontWeight: '400' },
});
