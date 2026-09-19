import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPEEDS_MPH, neonSelected, buttonDepth, accentGradient, useVerticalScale } from '../constants';
import { useTheme } from '../ThemeContext';
import SlidableSegmented from './SlidableSegmented';
import HelpModal from './HelpModal';
import FaveCuisineButton from './FaveCuisineButton';
import FrostedGlass from './FrostedGlass';

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
 * Travel-type toggle, distance/time control, and the collapsible cuisine
 * bubble picker. Fully controlled — all state lives in the parent.
 *
 * Min-rating used to live here too (a 5-star drag row) - moved to
 * SettingsPanel.js as a rarely-touched preference instead (user feedback:
 * "I never really touch it... most of the time that's food with 3.5 stars
 * or higher" - not worth a permanently-visible Home screen control for
 * something almost nobody adjusts after picking once, matching Units'
 * existing placement there).
 */
export default function FilterPanel({
  travelType,
  setTravelType,
  distance,
  setDistance,
  estimatedMaxTime,
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
      <FrostedGlass style={styles.sliderRing} contentStyle={styles.sliderContainer}>
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
      </FrostedGlass>

      {/* The bubble list itself now lives in CuisineDropdown.js - a frosted
          overlay anchored directly under this trigger (measured via
          cuisineTriggerRef, no gap) instead of expanding inline here, so
          this is just the trigger that opens it. Bottom corners square off
          while open so the two pieces read as one continuous panel rather
          than two stacked cards with a visible seam - squareBottom below
          drives that instead of a separate cuisineContainerOpen style, since
          it has to override the ring/blur/tint layers together now. */}
      <FrostedGlass
        ref={cuisineTriggerRef}
        collapsable={false}
        squareBottom={showCuisines}
        style={styles.cuisineRing}
        contentStyle={styles.cuisineContainer}
      >
        <View style={styles.cuisineHeader}>
          {/* FaveCuisineButton drives its touch handling off a raw
              PanResponder, not a Pressable (see that file's own docstring -
              it was built that way specifically to dodge the Pressable-vs-
              PanResponder responder fight this codebase has hit before,
              e.g. SlidableSegmented's history). Keeping it a sibling of the
              toggle Pressable below, rather than nesting it inside, sidesteps
              that fight entirely - each owns its own bounding box, so there's
              nothing to arbitrate. Rendered AFTER cuisineHeaderMain now (user
              feedback: read as "wrong side" sitting before the Cuisines
              label - a secondary quick-swap control belongs trailing after
              the primary label+chevron, not leading it). */}
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
                  - unlike FaveCuisineButton below, this parent is an ordinary
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
          <FaveCuisineButton
            slots={faveCuisines}
            onLoad={onLoadFave}
            onSave={onSaveFave}
            onRename={onRenameFave}
            selectedCuisines={selectedCuisines}
            attractPulse={showCuisines}
          />
        </View>
      </FrostedGlass>

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
  // Ring (outer, sizing) / Container (inner, padding+layout) split - see
  // FrostedGlass.js's own doc comment for why. backgroundColor dropped from
  // the inner style entirely now - the blur+tint layers provide it.
  sliderRing: { width: '85%', marginBottom: 10 * vscale },
  sliderContainer: { alignItems: 'center', padding: 14 * vscale },
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

  // marginBottom scales with vscale too - this is the gap immediately
  // above the rolling food strip, so it's the most direct lever for keeping
  // real breathing room between them on shorter screens. cuisineHeader's own
  // padding below stays fixed - that's the trigger's tap target, not
  // decorative spacing.
  cuisineRing: { width: '85%', marginBottom: 15 * vscale },
  cuisineContainer: {},
  // Plain row now, not itself a Pressable - the toggle Pressable and
  // FaveCuisineButton are touch siblings inside it (see the comment where
  // they render for why). paddingRight is trimmed since FaveCuisineButton
  // (now trailing, on the right) already has its own right-side padding for
  // the dot indicator.
  cuisineHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 20, paddingLeft: 20, paddingRight: 12 },
  // The actual toggle - everything that used to be cuisineHeader's own
  // content, now just this Pressable's, with the Fave button trailing after
  // it (marginLeft on that button, not here, since it's the one now sitting
  // second in the row).
  cuisineHeaderMain: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cuisineHeaderLeft: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  cuisineHeaderText: { color: colors.textLight, fontSize: 18, fontWeight: 'bold' },
  cuisineHeaderCount: { color: colors.textMuted, fontSize: 15, fontWeight: '400' },
  cuisineHelpBtn: { marginLeft: 6, padding: 2 },
});
