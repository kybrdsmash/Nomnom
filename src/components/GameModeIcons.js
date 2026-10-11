import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../ThemeContext';
import { accentGradient, neonSelected, buttonDepth } from '../constants';
import SlidableSegmented from './SlidableSegmented';

const MODES = [
  { value: 'dontcare', label: 'Surprise Me' },
  { value: 'elimination', label: 'Eliminate' },
  { value: 'list', label: 'Curated' },
];

/**
 * Left-side counterpart to QuickFilters' right-side toggle stack (user
 * request - the game-mode row read as visually unbalanced against
 * QuickFilters once that shipped). Replaces the old horizontal, text-labeled
 * SlidableSegmented mode toggle that sat directly above the coin.
 *
 * Styling now mirrors FilterPanel's travel-type toggle (same SlidableSegmented
 * underneath already, just horizontal there) rather than QuickFilters'
 * FrostedGlass/BlurView look - a live user report that dragging across this
 * felt un-smooth pointed at BlurView sitting directly under a continuously-
 * dragged PanResponder as the likely cause (blur re-rendering mid-gesture),
 * and the travel toggle (plain opaque per-segment backgrounds, no blur at
 * all) has never had that complaint despite sharing the identical gesture
 * code. Each segment now gets its own opaque background + buttonDepth
 * shadow + a pinned (always-present, only recoloring) border, and the
 * active one gets neonSelected's glow - the exact same recipe
 * FilterPanel.js's toggleBtnSmall/activeToggle already use.
 *
 * Icons sized to match QuickFilters' own toggles (20-24px range) rather
 * than the originally-shipped 18px, per user request ("as large as the
 * icons for the quick filters").
 *
 * Still one CONNECTED track (individual segments share one rounded outer
 * container), not 3 standalone circles matching QuickFilters' own look -
 * that's still deliberate, not undone by dropping the blur: game mode is
 * mutually exclusive (exactly one of three, always), and UX research on
 * segmented controls is explicit that a connected track + single active
 * fill is what visually signals "alternatives," not "any combination."
 *
 * The "notification of what's selected" a user request asked for is the
 * same bottom-center toast QuickFilters' own toggles already use (App.js's
 * showToast, wired in via onChangeGameMode).
 */
export default function GameModeIcons({ visible, hapticsEnabled = true, centerY, gameMode, onChangeGameMode }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [halfHeight, setHalfHeight] = useState(null);

  if (!visible) return null;

  // Same reasoning as QuickFilters' own COIN_SHADOW_VISUAL_OFFSET - this
  // stack sits on the coin's other side but the coin's ground shadow (see
  // CoinSpinner.js's groundShadow) pulls its PERCEIVED center down the same
  // way regardless of which side is looking at it. Value confirmed by direct
  // on-device pixel measurement (Pixel 9 Pro XL screenshot, 2026-10-10): the
  // previous value of 7 left this stack's measured center ~23dp above the
  // coin's actual rendered circle center - this and QuickFilters' identical
  // stack both measured to the exact same (wrong) center, confirming the
  // gap comes from measureCoin's shared coinCenterY, not per-component math.
  const COIN_SHADOW_VISUAL_OFFSET = 30;
  const half = halfHeight != null ? halfHeight : 100;
  const verticalStyle = centerY != null
    ? { top: centerY - half + COIN_SHADOW_VISUAL_OFFSET }
    : { bottom: 170 };

  return (
    <View
      style={[styles.wrap, verticalStyle]}
      pointerEvents="box-none"
      onLayout={(e) => {
        // Only ever set this ONCE (guarded on still being null) - see
        // QuickFilters.js's identical guard for why: setting it on every
        // onLayout created a real feedback loop (this state feeds
        // verticalStyle's `top`, moving the view fires onLayout again,
        // forever - confirmed live via rapid-fire logs) that was very
        // likely also behind unrelated reports of the whole app feeling
        // sluggish (e.g. slow nav-tab switches).
        if (halfHeight == null) setHalfHeight(e.nativeEvent.layout.height / 2);
      }}
    >
      <SlidableSegmented
        vertical
        options={MODES}
        value={gameMode}
        onChange={(v) => {
          if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onChangeGameMode(v);
        }}
        styles={{ segmented: styles.track, segment: styles.segment, segmentActive: styles.segmentActive }}
        gradientColors={accentGradient(colors).colors}
        renderOption={(opt, active) => <ModeIcon mode={opt.value} active={active} colors={colors} />}
      />
    </View>
  );
}

function ModeIcon({ mode, active, colors }) {
  const color = active ? colors.textDark : colors.textMuted;
  if (mode === 'dontcare') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Rect x={4} y={4} width={16} height={16} rx={4} />
        <Circle cx={8.5} cy={8.5} r={1.15} fill={color} stroke="none" />
        <Circle cx={12} cy={12} r={1.15} fill={color} stroke="none" />
        <Circle cx={15.5} cy={15.5} r={1.15} fill={color} stroke="none" />
      </Svg>
    );
  }
  if (mode === 'elimination') {
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M2 6h3.5v4" />
        <Path d="M2 18h3.5v-4" />
        <Path d="M5.5 10l3 2" />
        <Path d="M5.5 14l3-2" />
        <Path d="M11.5 12h2" />
        <Circle cx={17.5} cy={12} r={4.2} />
        <Path d="M15.9 10.4l3.2 3.2M19.1 10.4l-3.2 3.2" />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 13.2l-2.3 7.6 3.8-1.6.9 1.9" />
      <Path d="M15 13.2l2.3 7.6-3.8-1.6-.9 1.9" />
      <Circle cx={12} cy={9} r={6} />
      <Circle cx={12} cy={9} r={3.6} />
      <Path d="M10 9.1l1.3 1.3 2.6-2.8" strokeWidth={1.7} />
    </Svg>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  // right:30 on QuickFilters -> left:30 here, its mirror image.
  wrap: { position: 'absolute', left: 30, alignItems: 'center', zIndex: 45 },
  // Matches FilterPanel's toggleRowSmall pattern (plain opaque background,
  // no blur) - width fixed (not content-sized), same reasoning as there:
  // content-driven sizing risks the drag math's cached width going stale.
  track: {
    flexDirection: 'column', backgroundColor: colors.cardAlt, borderRadius: 20,
    padding: 3, width: 44,
  },
  // Matches toggleBtnSmall: own opaque background + real depth + a pinned
  // (always 2px, only recoloring) border so selecting never nudges layout.
  segment: {
    marginVertical: 3, paddingVertical: 6, alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, backgroundColor: colors.cardAlt, overflow: 'hidden',
    ...buttonDepth, elevation: 10, borderWidth: 2, borderColor: 'transparent',
  },
  segmentActive: { backgroundColor: colors.accent, ...neonSelected(colors) },
});
