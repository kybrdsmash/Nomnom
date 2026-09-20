import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../ThemeContext';
import { accentGradient } from '../constants';
import FrostedGlass from './FrostedGlass';
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
 * A single connected pill (not 3 standalone circles matching QuickFilters'
 * own look) is a deliberate choice, not an oversight - QuickFilters' circles
 * are genuinely independent on/off toggles (any combination), but game mode
 * is mutually exclusive (exactly one of the three, always). Public UX
 * research on segmented controls is explicit that the connected track +
 * single active fill is what visually communicates "these are alternatives,
 * not independent switches" - standalone circles here would misleadingly
 * suggest multi-select. The small active-mode label below the pill exists
 * for the same reason icon-only controls generally test worse than icon+
 * label ones (icons alone are frequently ambiguous) - it's the "notification
 * of what's selected" this was designed around.
 */
export default function GameModeIcons({ visible, hapticsEnabled = true, centerY, gameMode, onChangeGameMode }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [halfHeight, setHalfHeight] = useState(null);

  if (!visible) return null;

  // Same reasoning as QuickFilters' own COIN_SHADOW_VISUAL_OFFSET - this
  // stack sits on the coin's other side but the coin's ground shadow (see
  // CoinSpinner.js's groundShadow) pulls its PERCEIVED center down the same
  // way regardless of which side is looking at it.
  const COIN_SHADOW_VISUAL_OFFSET = 7;
  const half = halfHeight != null ? halfHeight : 100;
  const verticalStyle = centerY != null
    ? { top: centerY - half + COIN_SHADOW_VISUAL_OFFSET }
    : { bottom: 170 };

  const activeLabel = MODES.find((m) => m.value === gameMode)?.label || '';

  return (
    <View
      style={[styles.wrap, verticalStyle]}
      pointerEvents="box-none"
      onLayout={(e) => setHalfHeight(e.nativeEvent.layout.height / 2)}
    >
      <FrostedGlass style={styles.track} contentStyle={styles.trackInner} radius={26} tintOpacity={0.16}>
        <SlidableSegmented
          vertical
          options={MODES}
          value={gameMode}
          onChange={(v) => {
            if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onChangeGameMode(v);
          }}
          styles={{ segmented: styles.segmented, segment: styles.segment, segmentActive: styles.segmentActive }}
          gradientColors={accentGradient(colors).colors}
          renderOption={(opt, active) => <ModeIcon mode={opt.value} active={active} colors={colors} />}
        />
      </FrostedGlass>
      <View style={styles.labelPill}>
        <Text style={styles.labelText} numberOfLines={1}>{activeLabel}</Text>
      </View>
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
  track: { width: 52 },
  trackInner: { flexDirection: 'column' },
  segmented: { flexDirection: 'column' },
  segment: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  segmentActive: {},
  labelPill: {
    marginTop: 10, backgroundColor: 'rgba(94,235,255,0.12)', borderWidth: 1, borderColor: 'rgba(94,235,255,0.35)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, maxWidth: 90,
  },
  labelText: { color: colors.neon, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3, textAlign: 'center' },
});
