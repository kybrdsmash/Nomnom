import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Switch, PanResponder, KeyboardAvoidingView, StyleSheet } from 'react-native';
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

/**
 * Bottom-left settings menu, mirroring FabMenu's bottom-right expand
 * behavior: tap the gear to expand a panel with Appearance (a soft hue
 * picker driving the whole app's accent color), Profile (a display name for
 * friend-spin chat/sessions), and a few Preference toggles. Tapping anywhere
 * outside the expanded panel closes it.
 */
export default function SettingsPanel({
  visible, showSettingsMenu, setShowSettingsMenu,
  profile, setProfile, preferences, setPreferences, onOpenBugReport, onOpenHelp,
}) {
  const { colors, accentColor, setAccentColor } = useTheme();
  const styles = makeStyles(colors);
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

  if (!visible) return null;

  const previewColor = hslToHex(hue, PICKER_SAT, lightness);
  const progress = mode === 'hue' ? hue / 360 : (lightness - LIGHT_MIN) / (LIGHT_MAX - LIGHT_MIN);

  return (
    <>
      {showSettingsMenu && (
        <Pressable style={styles.backdrop} onPress={() => setShowSettingsMenu(false)} />
      )}
      <View style={styles.wrapper}>
        {showSettingsMenu && (
          // 'position' behavior (not 'padding'/'height') suits a floating,
          // absolutely-positioned panel like this rather than a full-screen
          // layout - shifts the panel itself up above the keyboard instead
          // of resizing/padding a parent that isn't meant to grow. This
          // wrapper existed once already (see git history) but was lost in a
          // later merge - regressed for both Profile and Report a Bug, not
          // just the field most recently reported (user report: "when
          // someone is adding their Profile name, the keyboard covers it").
          <KeyboardAvoidingView behavior="position">
          <View style={styles.panel}>
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
          </View>
          </KeyboardAvoidingView>
        )}
        <Pressable style={styles.gearBtn} onPress={() => setShowSettingsMenu(!showSettingsMenu)}>
          <Ionicons name="settings-sharp" size={22} color={colors.textDark} />
        </Pressable>
      </View>
    </>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 },
  wrapper: { position: 'absolute', bottom: 30, left: 30, alignItems: 'flex-start', zIndex: 50 },
  gearBtn: { backgroundColor: colors.accent, width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', ...buttonDepth },
  // ...buttonDepth adds the shadowColor/shadowOffset/shadowOpacity/shadowRadius
  // set iOS actually needs (bare elevation renders completely flat there) -
  // elevation re-pinned to 6 after the spread to keep this panel's original
  // Android depth unchanged.
  panel: { backgroundColor: colors.card, borderRadius: 18, padding: 16, marginBottom: 12, width: 260, ...buttonDepth, elevation: 6 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 },
  modeIndicator: { flexDirection: 'row', alignItems: 'center' },
  modeIndicatorText: { color: colors.gold, fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
  modeHint: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  sectionTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 13, letterSpacing: 1, marginBottom: 8, marginTop: 10 },
  sectionTitleInline: { color: colors.accent, fontWeight: 'bold', fontSize: 13, letterSpacing: 1 },
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
