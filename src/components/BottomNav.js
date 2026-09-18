import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { neonSelected } from '../constants';

/**
 * Persistent 5-destination bottom nav (Option C from the design canvas
 * review: a floating pill, not a slide-out drawer or a full-width tab bar -
 * picked for tying every destination to exactly 1 tap, matching the
 * clicks-to-action goal, without the drawer's extra tap or the tab bar's
 * permanent full-width footprint).
 *
 * First increment: added alongside FabMenu.js, not replacing it yet -
 * FabMenu also carries the Open Now/Max Price/Favorites-only filter
 * toggles, which are out of scope for a pure navigation shell. Once the My
 * Places hub consolidates Favorites/Try Later/Journal into one destination,
 * FabMenu's remaining nav-only buttons (History/Favorites/TryLater/Journal)
 * become redundant with this and can come out.
 *
 * "Places" doesn't have its own activeView yet (it currently routes to
 * 'favorites', the closest existing screen) - the real My Places hub
 * (Favorites/Try Later/Journal/Friends as tabs in one screen) is its own
 * follow-up increment, not part of this nav-shell pass.
 */
export default function BottomNav({ activeTab, onSelect }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const items = [
    { key: 'home', label: 'Home' },
    { key: 'places', label: 'Places' },
    { key: 'feast', label: 'Feast' },
    { key: 'history', label: 'History' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <View style={styles.bar}>
      {items.map((item) => {
        const active = activeTab === item.key;
        return (
          <Pressable
            key={item.key}
            style={[styles.item, active && styles.itemActive, active && neonSelected(colors)]}
            onPress={() => onSelect(item.key)}
            hitSlop={4}
          >
            <NavIcon iconKey={item.key} active={active} colors={colors} />
          </Pressable>
        );
      })}
    </View>
  );
}

function NavIcon({ iconKey, active, colors }) {
  const color = active ? colors.textDark : colors.textMuted;
  const size = 22;
  switch (iconKey) {
    case 'home':
      return <Ionicons name={active ? 'home' : 'home-outline'} size={size} color={color} />;
    case 'feast':
      return <Ionicons name={active ? 'people' : 'people-outline'} size={size} color={color} />;
    case 'history':
      return <Ionicons name={active ? 'book' : 'book-outline'} size={size} color={color} />;
    case 'settings':
      return <Ionicons name="settings-sharp" size={size} color={color} />;
    case 'places':
      return <PlacesIcon color={color} />;
    default:
      return null;
  }
}

// Skyline + pin, merged - the picked "My Places" icon from the design
// canvas review: two flanking buildings with a gold pin standing in for the
// center building, flush against its neighbors (one silhouette, not a house
// icon bolted to a bookmark). Windows dropped at this size - they read as
// noise once shrunk to a real 22px nav icon, same call made in the canvas
// review itself.
function PlacesIcon({ color }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={13} width={5} height={8} stroke={color} strokeWidth={1.6} />
      <Rect x={16} y={10} width={5} height={11} stroke={color} strokeWidth={1.6} />
      <Path d="M12 7a4 4 0 00-4 4c0 4.6 4 10 4 10s4-5.4 4-10a4 4 0 00-4-4z" stroke={color} strokeWidth={1.6} />
      <Circle cx={12} cy={10.5} r={1.3} stroke={color} strokeWidth={1.2} />
      <Path d="M2 21h20" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    backgroundColor: '#171717',
    borderRadius: 26,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 18,
  },
  itemActive: {
    backgroundColor: colors.accent,
  },
});
