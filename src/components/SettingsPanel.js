import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, TextInput, Switch, PanResponder, KeyboardAvoidingView, Animated, Easing, ScrollView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { neonSelected, buttonDepth, accentGradient } from '../constants';
import { hexToHsl, hslToHex } from '../utils/color';
import { isFirebaseConfigured } from '../api/firebase';
import SlidableSegmented from './SlidableSegmented';
import AccountSection from './AccountSection';
import { BUDDY_AVATARS } from '../buddyAvatars';

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

// Same keys/labels as BottomNav.js's own `items` array - kept as a separate
// list here (not imported) since BottomNav doesn't export its items, and
// duplicating 5 short strings is simpler than adding an export just for this.
const NAV_USAGE_ITEMS = [
  { key: 'home', label: 'Home' },
  { key: 'places', label: 'Places' },
  { key: 'feast', label: 'Feast' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'settings', label: 'Settings' },
];

/**
 * Right-side slide-out settings drawer: tap BottomNav's Settings icon to
 * slide it in over Appearance (a soft hue picker driving the whole app's
 * accent color), Profile (a display name for friend-spin chat/sessions),
 * and a few Preference toggles. Tapping the backdrop closes it.
 *
 * Used to have its own floating gear trigger too, hidden via a `hideTrigger`
 * prop whenever BottomNav was showing - but BottomNav itself hides during
 * Home's busy states (searching/result/elimination/browse - see App.js's
 * showFab), which made hideTrigger false and resurrected this stray gear
 * button ON TOP of the results page (user report: "the old settings button
 * is sitting on the results page of eliminate... also there on surprise
 * me"). Removed outright - BottomNav's own Settings icon is the only
 * trigger now; App.js has its own dedicated back button for leaving results
 * entirely, which is what people actually wanted out of that stray icon.
 *
 * Was a small bottom-left popup sized to its own content - moved to a full-
 * height right-side drawer (user request: "makes more sense... so we can
 * add more content as needed" - the popup was already getting cramped once
 * Minimum Rating moved in here). The drawer is ALWAYS mounted (no
 * `visible`-gated early return) and only ever moves via drawerX's
 * translateX - a previous version returned null whenever a `visible` prop
 * (showFab || showSettingsMenu) went false, which happens on every screen
 * except an idle Home even with Settings fully closed. That unmounted the
 * real native view mid-animation (or left drawerX's native-driven value
 * stale) any time you navigated to Places/Favorites/Feast, so the NEXT time
 * it remounted - e.g. tapping Home afterward - it could reappear already
 * open, with showSettingsMenu correctly false and BottomNav's highlight
 * correctly on Home the whole time (confirmed via a screen recording: the
 * nav state was never wrong, only the drawer's own animated position was
 * stale). Always rendering it means drawerX's animation always runs to
 * completion and its resting value is always trustworthy.
 */
export default function SettingsPanel({
  showSettingsMenu, setShowSettingsMenu,
  profile, setProfile, preferences, setPreferences, minRating, setMinRating,
  navTapCounts = {},
  buddyAvatar, onChangeBuddy,
  onOpenBugReport, onOpenHelp,
}) {
  const { colors, accentColor, setAccentColor } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);
  const [navUsageOpen, setNavUsageOpen] = useState(false);
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
      // Re-measures fresh on every gesture start instead of trusting
      // pickerBoundsRef's onLayout-time snapshot (below) - this drawer is
      // always mounted and slides in via a `transform`, which never
      // re-triggers onLayout, so that snapshot was taken wherever the
      // drawer happened to be laid out FIRST (often still off-screen,
      // before its very first slide-in animation ever ran) and then never
      // updated again for the component's whole lifetime. Every drag after
      // that used a stale, shifted-by-the-drawer's-own-width originX,
      // which could map the entire real on-screen track to ratio 0 or 1
      // depending on the shift's direction - looked exactly like "drag to
      // one end and it's stuck there" (user report) since no amount of
      // dragging within the real visible track could ever produce a
      // pageX on the other side of that wrong reference point.
      onPanResponderGrant: (evt) => {
        const { pageX } = evt.nativeEvent;
        pickerRowRef.current?.measureInWindow((originX, _y, width) => {
          pickerBoundsRef.current = { pageX: originX, width };
          handleMove(pageX);
        });
      },
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
      // Same fresh-remeasure-on-grant fix as the color picker above, same
      // reason - this drawer is always mounted and slides via `transform`,
      // so starBoundsRef's onLayout-time snapshot (below) never updates
      // again after being captured, possibly while still off-screen.
      onPanResponderGrant: (evt) => {
        const { pageX } = evt.nativeEvent;
        starRowRef.current?.measureInWindow((originX, _y, width) => {
          starBoundsRef.current = { pageX: originX, width };
          setMinRating(ratingFromPageX(pageX));
        });
      },
      onPanResponderMove: (evt) => setMinRating(ratingFromPageX(evt.nativeEvent.pageX)),
    })
  ).current;

  const previewColor = hslToHex(hue, PICKER_SAT, lightness);
  const progress = mode === 'hue' ? hue / 360 : (lightness - LIGHT_MIN) / (LIGHT_MAX - LIGHT_MIN);

  return (
    <>
      {showSettingsMenu && (
        <Pressable style={styles.backdrop} onPress={() => setShowSettingsMenu(false)} />
      )}
      {/* Always mounted now (see the component docstring) - not gated by
          showSettingsMenu - and slides via translateX instead of being
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
        {/* A right-pointing chevron on the drawer's own left edge - user
            request: nothing on the drawer itself hinted at how to close it
            (the backdrop tap works, but is invisible/undiscoverable). Points
            the direction the drawer itself travels when it closes (right,
            back off-screen), tucked onto the edge rather than another full
            button competing with the content. */}
        <Pressable
          style={styles.closeTab}
          onPress={() => setShowSettingsMenu(false)}
          hitSlop={8}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.textDark} />
        </Pressable>
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
            <AccountSection />

            {/* Reopens the same BuddyPicker shown on first launch (see
                App.js's showBuddyPickerManual) - dismissible this time,
                since a buddy already exists to fall back to. */}
            {buddyAvatar && BUDDY_AVATARS[buddyAvatar] && (
              <Pressable style={styles.buddyRow} onPress={onChangeBuddy}>
                <Image source={BUDDY_AVATARS[buddyAvatar].source} style={styles.buddyRowImage} resizeMode="cover" />
                <Text style={styles.buddyRowLabel}>Change your buddy ({BUDDY_AVATARS[buddyAvatar].label})</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            )}

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

            {/* Re-enables the "leaving Nomnom" Maps confirmation after
                someone's dismissed it with "Don't ask me again" - undefined
                (never saved before) reads as on, same treatment as the
                warning's own check in App.js's openMaps. */}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Confirm before opening Maps</Text>
              <Switch
                value={preferences.mapsWarning !== false}
                onValueChange={(mapsWarning) => setPreferences((prev) => ({ ...prev, mapsWarning }))}
                trackColor={{ false: colors.cardAlt, true: colors.accent }}
                thumbColor={colors.textLight}
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

            {/* Anonymous, local-only tap counts per BottomNav destination
                (see App.js's navTapCounts / src/storage.js's
                loadNavTapCounts) - user request, real usage data (sorted
                most-tapped first) to inform whether the bottom nav's
                current 5-slot layout actually matches how it gets used,
                rather than going purely on general UX convention. Never
                leaves the device - no analytics SDK, no user id. Collapsed
                by default (user feedback: "I actually think it's
                unnecessary" once it existed - useful data, but not worth
                permanently taking up space in a drawer people open often). */}
            <Pressable style={styles.sectionTitleRow} onPress={() => setNavUsageOpen((v) => !v)}>
              <Text style={styles.sectionTitleInline}>Nav Usage (this device)</Text>
              <Ionicons name={navUsageOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </Pressable>
            {navUsageOpen && (
              <View style={styles.navUsageBox}>
                {NAV_USAGE_ITEMS
                  .map((item) => ({ ...item, count: navTapCounts[item.key] || 0 }))
                  .sort((a, b) => b.count - a.count)
                  .map((item) => (
                    <View key={item.key} style={styles.navUsageRow}>
                      <Text style={styles.navUsageLabel}>{item.label}</Text>
                      <Text style={styles.navUsageCount}>{item.count}</Text>
                    </View>
                  ))}
              </View>
            )}

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
  // Full height, fixed width, docked to the right edge - replaces the old
  // content-sized bottom-left `panel` (user request: a real drawer "so we
  // can add more content as needed" rather than a popup that keeps getting
  // more cramped). shadowOffset points left (negative width) since the
  // shadow should fall toward the screen's content, not off the right edge
  // where nothing would ever see it.
  // Recessed just inside the drawer's own left edge (was a negative left
  // offset straddling the edge, poking half of it out over the content
  // behind - user feedback: should sit inside the drawer, not stick out) -
  // low, near the drawer's own bottom-left corner (earlier user request:
  // was vertically centered, wanted it "down low, close to the bottom left
  // inside corner" instead) - insets.bottom keeps it clear of any gesture
  // bar, same convention as drawerContent's own bottom padding just below.
  // `left` centers this under helpBtn (the "(i)" button lower in the
  // drawer) rather than an arbitrary 14 - helpBtn sits at drawerContent's
  // own 20px padding + half its own 40px width = 40px from the drawer's
  // left edge; this button is 36 wide, so left = 40 - 18 = 22 lines their
  // centers up exactly (user feedback: "it looks weird being slightly off").
  // backgroundColor+color both use colors.accent/textDark (App.js's own
  // accent-pill convention, e.g. its backFromResultsBtn) so it reads as
  // "part of the settings affordance," not a random stray button.
  closeTab: {
    position: 'absolute', left: 22, bottom: insets.bottom + 40, zIndex: 256,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    ...buttonDepth,
  },
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
  buddyRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 14, padding: 10, marginBottom: 10, gap: 10,
  },
  buddyRowImage: { width: 34, height: 34, borderRadius: 8 },
  buddyRowLabel: { flex: 1, color: colors.textLight, fontSize: 13, fontWeight: '600' },
  // Nav Usage list - plain rows, sorted most-tapped first by the caller.
  navUsageBox: { backgroundColor: colors.card, borderRadius: 14, padding: 12, marginBottom: 4 },
  navUsageRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  navUsageLabel: { color: colors.textLight, fontSize: 14 },
  navUsageCount: { color: colors.textMuted, fontSize: 14, fontWeight: 'bold' },
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
  // marginBottom matches `row`'s own spacing below (10) - this had none,
  // so GoogleSignInRow sat flush against it while every other section kept
  // the same even rhythm (user report: "google sign in block needs a
  // little space from the profile your name box... space it out equally
  // like the other gaps").
  input: { backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.textLight, fontSize: 14, marginBottom: 10 },
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
