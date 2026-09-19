import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Switch, PanResponder, KeyboardAvoidingView, Animated, Easing, ScrollView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { neonSelected, buttonDepth, accentGradient } from '../constants';
import { hexToHsl, hslToHex } from '../utils/color';
import { isFirebaseConfigured } from '../api/firebase';
import SlidableSegmented from './SlidableSegmented';
import GoogleSignInRow from './GoogleSignInRow';

// Fixed saturation keeps every pick in the same soft, glowing pastel
// family (matching the current Frost blue's feel) regardless of hue or
// brightness - only lightness varies, and only within LIGHT_MIN/LIGHT_MAX
// so a brightness adjustment can never wash out to pure white or crush to
// near-black.
const PICKER_SAT = 55;
const DEFAULT_LIGHT = 68;
const LIGHT_MIN = 35;
const LIGHT_MAX = 82;
const HUE_STOPS = Array.from({ length: 13 }, (_, i) => hslToHex((i * 360) / 12, PICKER_SAT, DEFAULT_LIGHT));
const clampLight = (l) => Math.min(LIGHT_MAX, Math.max(LIGHT_MIN, l));
// Same hue, dark->light - the gradient shown while adjusting brightness.
const brightnessStops = (hue) =>
  Array.from({ length: 7 }, (_, i) => hslToHex(hue, PICKER_SAT, LIGHT_MIN + (i * (LIGHT_MAX - LIGHT_MIN)) / 6));

// Fixed drawer width (not a screen-width fraction) - the slide animation
// below drives translateX by exactly this amount, so it has to be a real
// number rather than a percentage.
const DRAWER_WIDTH = 300;

/**
 * Right-side slide-out settings drawer: tap the gear (or BottomNav's
 * Settings icon) to slide it in over Appearance (a soft hue picker driving
 * the whole app's accent color), Profile (a display name for friend-spin
 * chat/sessions), and a few Preference toggles. Tapping the backdrop closes
 * it. The gear trigger itself is hidden whenever BottomNav is showing (see
 * hideTrigger below) - BottomNav's own Settings icon opens this exact same
 * drawer now.
 *
 * Was a small bottom-left popup sized to its own content - moved to a full-
 * height right-side drawer (user request: "makes more sense... so we can
 * add more content as needed" - the popup was already getting cramped once
 * Minimum Rating moved in here). The drawer itself stays mounted whenever
 * `visible` is true and is animated off-screen via translateX rather than
 * conditionally unmounted, so closing it can actually slide back out instead
 * of just vanishing.
 */
export default function SettingsPanel({
  visible, hideTrigger, showSettingsMenu, setShowSettingsMenu,
  profile, setProfile, preferences, setPreferences, minRating, setMinRating,
  onOpenBugReport, onOpenHelp,
}) {
  const { colors, accentColor, setAccentColor } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);
  const drawerX = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  // Tracks whichever animation (open OR close) is currently running on
  // drawerX, so a new one can explicitly .stop() it first - see below.
  const drawerAnimRef = useRef(null);

  useEffect(() => {
    // Opening gets a short delay before the drawer itself starts sliding -
    // BottomNav's own highlight (see its own ~240ms slide) was starting at
    // the exact same instant as this drawer's animation, so the drawer
    // visually "jumped out" without the highlight ever appearing to lead it
    // (user report: "the settings [icon] doesn't highlight before the
    // drawer rolls out"). No delay on close - there's nothing to wait for
    // there, the highlight is already leaving that slot as the tap lands.
    //
    // .stop() the PREVIOUS animation before starting a new one - without
    // this, a fast open-then-close (tap Settings, then immediately tap a
    // different nav icon within that 150ms) left the open's delay still
    // pending underneath the close that had already started; 150ms later
    // the stale open fired anyway and snapped the drawer back open with no
    // further effect ever re-closing it (confirmed on-device via a screen
    // recording - the drawer stayed open across several nav taps, tracking
    // each screen's own highlight correctly the whole time, since only the
    // drawer's animation was stuck, not the actual nav state).
    if (drawerAnimRef.current) drawerAnimRef.current.stop();
    const animation = showSettingsMenu
      ? Animated.sequence([
          Animated.delay(150),
          Animated.timing(drawerX, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ])
      : Animated.timing(drawerX, { toValue: DRAWER_WIDTH, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    drawerAnimRef.current = animation;
    animation.start();
  }, [showSettingsMenu]);
  const [hue, setHue] = useState(() => hexToHsl(accentColor).h);
  const [lightness, setLightness] = useState(() => clampLight(hexToHsl(accentColor).l));
  // Tap the Color/Brightness chip (top-right of this section) to switch
  // what the slider below controls: hue (the default) or brightness of
  // whatever hue is currently picked. Used to be a double-tap on the slider
  // itself - moved to its own dedicated element since that was ambiguous
  // with "start dragging" (see pickerPan below).
  const [mode, setMode] = useState('hue'); // 'hue' | 'brightness'
  // Tracks the hex WE last produced from the current hue/lightness, so the
  // sync effect below can tell "accentColor changed elsewhere" apart from
  // "accentColor changed because we just set it". Without this, every edit
  // round-tripped hue/lightness -> hex -> back through hexToHsl, and hex
  // conversion is lossy (rounds to integer RGB) - at this pastel saturation
  // that rounding noise was enough to visibly drift the hue on every single
  // brightness adjustment, which looked like "can't get back to the hue I
  // had" even though the mode toggle itself was switching correctly.
  const lastSetHexRef = useRef(accentColor);

  useEffect(() => {
    if (accentColor === lastSetHexRef.current) return;
    const parsed = hexToHsl(accentColor);
    setHue(parsed.h);
    setLightness(clampLight(parsed.l));
  }, [accentColor]);

  const applyColor = (hex) => {
    lastSetHexRef.current = hex;
    setAccentColor(hex);
  };

  // Track width in pixels (not a percentage) drives the dial's `left`, same
  // reasoning as the distance/rating sliders in FilterPanel - percentage-
  // based `left` on an absolutely positioned view is an unreliable RN
  // layout path on Android.
  const [trackWidth, setTrackWidth] = useState(0);
  const pickerRowRef = useRef(null);
  const pickerBoundsRef = useRef({ pageX: 0, width: 0 });

  // PanResponder.create() only runs once (useRef freezes it after the first
  // render), so its callbacks can't close over `mode`/`hue`/`lightness`
  // directly - same stale-closure lesson as FilterPanel's distance/rating
  // sliders and CoinSpinner's flick handler. Refs reassigned every render
  // keep the callbacks reading the CURRENT values.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const hueRef = useRef(hue);
  hueRef.current = hue;
  const lightnessRef = useRef(lightness);
  lightnessRef.current = lightness;

  const valueFromPageX = (pageX) => {
    const { pageX: originX, width } = pickerBoundsRef.current;
    if (!width) return modeRef.current === 'hue' ? hueRef.current : lightnessRef.current;
    const ratio = Math.min(1, Math.max(0, (pageX - originX) / width));
    if (modeRef.current === 'hue') return ratio * 360;
    return clampLight(LIGHT_MIN + ratio * (LIGHT_MAX - LIGHT_MIN));
  };

  const handleMove = (pageX) => {
    const v = valueFromPageX(pageX);
    if (modeRef.current === 'hue') {
      hueRef.current = v;
      setHue(v);
    } else {
      lightnessRef.current = v;
      setLightness(v);
    }
  };

  // Committing (on release) is what actually updates the app's real accent
  // color - onPanResponderMove above only updates local hue/lightness state,
  // which is what drives the dial's own live preview color. Splitting these
  // (live local preview vs. committed-on-release theme color) matches the
  // old Slider's onValueChange/onSlidingComplete split, just now on values a
  // plain View can render from every single render - no native component
  // prop is left to silently lag behind mid-gesture (see the dial's
  // backgroundColor below for why that's the actual fix here).
  const commitColor = () => {
    applyColor(hslToHex(hueRef.current, PICKER_SAT, lightnessRef.current));
  };

  const pickerPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // Used to double-tap-detect a mode switch here, folded into the same
      // responder as the drag gesture - but the FIRST tap of a double-tap is
      // indistinguishable from "start dragging from here" until the SECOND
      // tap confirms it, and that first tap's handleMove() below had
      // already shifted the picked hue/brightness to wherever it landed
      // before the switch could fire (user report: "double tap just messes
      // up the color I already picked"). Mode switching now lives entirely
      // on its own dedicated element (the Color/Brightness chip above the
      // slider) instead, so every touch here is unambiguously just a drag.
      onPanResponderGrant: (evt) => handleMove(evt.nativeEvent.pageX),
      onPanResponderMove: (evt) => handleMove(evt.nativeEvent.pageX),
      onPanResponderRelease: commitColor,
    })
  ).current;

  // Min-rating drag row - relocated from FilterPanel.js's Home screen (user
  // feedback: "I never really touch it... most of the time that's food with
  // 3.5 stars or higher" - moved here as a rarely-touched preference,
  // matching Units' existing placement, rather than a permanently-visible
  // Home screen control almost nobody adjusts after picking once).
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

  if (!visible) return null;

  const previewColor = hslToHex(hue, PICKER_SAT, lightness);
  const progress = mode === 'hue' ? hue / 360 : (lightness - LIGHT_MIN) / (LIGHT_MAX - LIGHT_MIN);

  return (
    <>
      {showSettingsMenu && (
        <Pressable style={styles.backdrop} onPress={() => setShowSettingsMenu(false)} />
      )}
      {/* Stays mounted whenever `visible` is true (not gated by
          showSettingsMenu) and slides via translateX instead of being
          conditionally rendered - so closing it actually animates back
          off-screen instead of just vanishing. pointerEvents off while
          closed so the off-screen drawer can't eat touches meant for
          whatever's underneath it. behavior="height" (not the old
          "position") suits a full-height container better - it resizes the
          drawer's own height for the keyboard, letting the ScrollView
          inside scroll the focused field into view naturally, rather than
          shifting the whole drawer's Y position the way "position" did for
          the old bottom-anchored popup. */}
      <Animated.View
        style={[styles.drawer, { transform: [{ translateX: drawerX }] }]}
        pointerEvents={showSettingsMenu ? 'auto' : 'none'}
      >
        <KeyboardAvoidingView
          style={styles.drawerFlex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.drawerFlex}
            contentContainerStyle={styles.drawerContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitleInline}>Appearance</Text>
              {/* The mode switch itself now, not just an indicator - tap to
                  toggle what the slider below controls (used to be a
                  double-tap on the slider, see pickerPan above for why that
                  moved here). */}
              <Pressable
                style={styles.modeIndicator}
                onPress={() => setMode((m) => (m === 'hue' ? 'brightness' : 'hue'))}
                hitSlop={8}
              >
                <Ionicons
                  name={mode === 'hue' ? 'color-palette-outline' : 'sunny-outline'}
                  size={13}
                  color={colors.gold}
                />
                <Text style={styles.modeIndicatorText}>{mode === 'hue' ? 'Color' : 'Brightness'}</Text>
              </Pressable>
            </View>
            {/* Hand-built track + dial (same tap-or-drag-directly-on-it
                pattern as FilterPanel's distance/rating sliders), replacing
                the previous @react-native-community/slider. That native
                Slider's thumbTintColor DID update every render, but Android
                doesn't reliably repaint a native widget's internal thumb
                drawable mid-gesture from a fast-changing prop - the color
                only visibly caught up once you let go and the component
                fully settled (user report: "changes color... only when you
                stop"). A plain View's backgroundColor has no such lag
                anywhere else in this app, so giving the dial itself a
                direct backgroundColor of the live previewColor fixes this
                structurally rather than papering over a native timing gap. */}
            <View
              ref={pickerRowRef}
              style={styles.pickerTouchArea}
              onLayout={(e) => {
                setTrackWidth(e.nativeEvent.layout.width);
                pickerRowRef.current?.measureInWindow((pageX, _pageY, width) => {
                  pickerBoundsRef.current = { pageX, width };
                });
              }}
              {...pickerPan.panHandlers}
            >
              <LinearGradient
                colors={mode === 'hue' ? HUE_STOPS : brightnessStops(hue)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.gradientBar}
              />
              <View
                style={[
                  styles.pickerDial,
                  { left: progress * trackWidth - 14, backgroundColor: previewColor },
                ]}
              />
            </View>
            <Text style={styles.modeHint}>Tap {mode === 'hue' ? 'Color' : 'Brightness'} above to switch</Text>

            <Text style={styles.sectionTitle}>Profile</Text>
            <TextInput
              style={styles.input}
              value={profile.displayName}
              onChangeText={(displayName) => setProfile((prev) => ({ ...prev, displayName }))}
              placeholder="Your name (shown to friends)"
              placeholderTextColor="#777"
              maxLength={24}
            />
            <GoogleSignInRow />

            <Text style={styles.sectionTitle}>Preferences</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Haptics</Text>
              <Switch
                value={preferences.haptics}
                onValueChange={(haptics) => setPreferences((prev) => ({ ...prev, haptics }))}
                trackColor={{ false: colors.cardAlt, true: colors.accent }}
                thumbColor={colors.textLight}
              />
            </View>

            <View style={styles.row}>
              <Text style={styles.rowLabel}>Units</Text>
              <SlidableSegmented
                options={[{ value: 'mi', label: 'mi' }, { value: 'km', label: 'km' }]}
                value={preferences.units}
                onChange={(units) => setPreferences((prev) => ({ ...prev, units }))}
                styles={styles}
                gradientColors={accentGradient(colors).colors}
              />
            </View>

            {/* Relocated from the Home screen (see the hook comments above
                for why) - full-width block like Appearance above, not the
                compact label+control row Haptics/Units use, since 5 stars
                need real horizontal room even at a smaller size than they
                had on Home. */}
            <View style={styles.minRatingSection}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitleInline}>Minimum Rating</Text>
              </View>
              <View style={styles.minRatingRow}>
                <View
                  ref={starRowRef}
                  style={styles.minRatingStars}
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
                      <Ionicons key={star} name={iconName} size={22} color={colors.gold} style={{ paddingHorizontal: 1 }} />
                    );
                  })}
                </View>
                <Text style={styles.minRatingCaption}>{minRating.toFixed(1)}+</Text>
              </View>
            </View>

            {/* The help icon doesn't depend on Firebase (it's static
                in-app content) so it's not gated behind isFirebaseConfigured
                the way Report a Bug is - own touch target, real gap
                (marginRight below) from the button beside it, so the two
                can't get hit by accident (user request). */}
            <View style={styles.bugReportRow}>
              <Pressable style={styles.helpBtn} onPress={onOpenHelp} hitSlop={6}>
                <Ionicons name="information-circle-outline" size={22} color={colors.accent} />
              </Pressable>
              {isFirebaseConfigured && (
                <Pressable style={styles.bugReportBtn} onPress={onOpenBugReport}>
                  <Ionicons name="bug-outline" size={15} color={colors.textDark} />
                  <Text style={styles.bugReportBtnText}>Report a Bug</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
      {/* BottomNav's own Settings icon toggles this exact same
          showSettingsMenu state now and used to sit almost exactly on top of
          this button's old bottom-left position (a real visual collision,
          not just redundant coexistence - confirmed on-device). Hidden
          whenever BottomNav is showing rather than deleted outright, since
          hideTrigger is driven by the exact same flag (showBottomNav in
          App.js) that gates BottomNav's own visibility - if that ever
          changes, this button reappears as a safe fallback. Left in its
          original bottom-left spot even though the drawer now opens from
          the right - it's essentially always hidden today anyway (hideTrigger
          is true whenever BottomNav shows, which is every time this is
          visible at all), so it wasn't worth relocating for a path that
          doesn't currently render. */}
      {!hideTrigger && (
        <Pressable style={styles.gearBtn} onPress={() => setShowSettingsMenu(!showSettingsMenu)}>
          <Ionicons name="settings-sharp" size={22} color={colors.textDark} />
        </Pressable>
      )}
    </>
  );
}

const makeStyles = (colors, insets = { top: 0, bottom: 0 }) => StyleSheet.create({
  // zIndex bumped 40/50/55 -> 240/250/255 (same +200 shift across all three,
  // preserving their relative order) - Settings can now open from Places/
  // Favorites/Feast too (BottomNav persists there - see App.js's
  // showBottomNav), and those screens' own root Views are zIndex:90/100
  // (MyPlacesHub/HistoryFavoritesOverlay/FriendSpin), which used to have
  // nothing to compete with here since this drawer only ever had to out-
  // stack Home's plain zIndex:0 content. Below that, BottomNav itself is
  // zIndex:200 - the drawer needs to sit above it too so it can't be tapped
  // through while open, hence starting past 200 rather than just past 100
  // (caught on-device: opening Settings from Favorites highlighted the
  // gear correctly but the drawer itself never appeared - it was painting
  // underneath HistoryFavoritesOverlay the whole time).
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 240 },
  // Own absolute position now (used to be a child of `wrapper`, which also
  // held the panel - that shared anchor is gone now that the drawer lives on
  // the opposite edge of the screen from this fallback trigger).
  gearBtn: {
    position: 'absolute', bottom: 30, left: 30, zIndex: 250,
    backgroundColor: colors.accent, width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', ...buttonDepth,
  },
  // Full height, fixed width, docked to the right edge - replaces the old
  // content-sized bottom-left `panel` (user request: a real drawer "so we
  // can add more content as needed" rather than a popup that keeps getting
  // more cramped). shadowOffset points left (negative width) since the
  // shadow should fall toward the screen's content, not off the right edge
  // where nothing would ever see it.
  drawer: {
    position: 'absolute', top: 0, bottom: 0, right: 0, width: DRAWER_WIDTH,
    backgroundColor: colors.card, zIndex: 255,
    elevation: 20, shadowColor: '#000', shadowOffset: { width: -4, height: 0 }, shadowOpacity: 0.4, shadowRadius: 12,
  },
  drawerFlex: { flex: 1 },
  drawerContent: { padding: 20, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 },
  modeIndicator: { flexDirection: 'row', alignItems: 'center' },
  modeIndicatorText: { color: colors.gold, fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  modeHint: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  sectionTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 13, letterSpacing: 1, marginBottom: 8, marginTop: 10 },
  sectionTitleInline: { color: colors.accent, fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
  minRatingSection: { marginTop: 4 },
  minRatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  minRatingStars: { flexDirection: 'row', paddingVertical: 6 },
  minRatingCaption: { color: colors.textMuted, fontSize: 13, marginLeft: 8 },
  // Same tap-or-drag touch area as FilterPanel's distTouchArea - paddingVertical
  // gives the dial room to sit centered on the thin gradient bar without the
  // touch target itself being as thin as the bar.
  pickerTouchArea: { width: '100%', paddingVertical: 14, justifyContent: 'center', marginBottom: 4 },
  gradientBar: { height: 10, borderRadius: 5, width: '100%' },
  // top is a fixed pixel offset, not a percentage - same reasoning as
  // FilterPanel's distDial. pickerTouchArea's height is paddingVertical:14*2
  // + gradientBar's 10, so its vertical center sits 19px down; offsetting by
  // the dial's own half-height (14) centers it exactly. backgroundColor is
  // NOT set here - it's applied inline from the live previewColor so it
  // updates every render, including mid-drag (see the comment where this is
  // used).
  pickerDial: { position: 'absolute', top: 5, width: 28, height: 28, borderRadius: 14, ...neonSelected(colors) },
  input: { backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.textLight, fontSize: 14 },
  bugReportRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  helpBtn: {
    width: 40, height: 40, borderRadius: 14, marginRight: 10,
    backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center',
  },
  bugReportBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 10, ...buttonDepth,
  },
  bugReportBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 13, marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  rowLabel: { color: colors.textLight, fontSize: 14, fontWeight: '600' },
  // Fixed width + flex:1 segments - NOT content-driven sizing. The active
  // segment's label goes bold, which is wider than the regular weight; with
  // a content-sized container that shift changed the row's own pixel width
  // after every selection, and the drag math's cached width (sampled once
  // via onLayout) went stale relative to the new size - looked like the
  // control "got stuck" after sliding right. A fixed geometry sidesteps it.
  segmented: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: 16, padding: 3, width: 140, overflow: 'hidden' },
  // marginHorizontal gives the active segment's neon glow room to breathe -
  // Android's `elevation` shadow can bleed sideways onto a flush-adjacent
  // sibling, visually painting over the inactive segment's text (looked
  // like it "disappeared" - user feedback).
  // Explicit backgroundColor for the same reason as the mode toggle/travel
  // toggle - Android's elevation (from the active segment's neon glow)
  // needs an opaque surface on its inactive sibling too.
  segment: { flex: 1, marginHorizontal: 2, paddingVertical: 6, alignItems: 'center', borderRadius: 14, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.textMuted, fontSize: 13 },
  segmentTextActive: { color: colors.textDark, fontWeight: 'bold' },
});
