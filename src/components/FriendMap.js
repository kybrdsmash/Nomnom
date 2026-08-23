import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { neonSelected, buttonDepth } from '../constants';
import { useTheme } from '../ThemeContext';

/** Bounding region around every given {latitude, longitude} point, with padding. */
function regionForPoints(points) {
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // 1.6x the raw spread plus a floor - some padding around the outermost
    // points instead of cropping them right at the map's edge, and never so
    // zoomed-in that tight clusters look like one blob.
    latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.6),
  };
}

/**
 * A food-spot marker. react-native-maps re-renders a custom marker's icon
 * into a bitmap on every parent re-render by default (`tracksViewChanges`
 * defaults to true) - and this screen re-renders on every Firestore
 * snapshot, so every marker was being needlessly re-snapshotted constantly,
 * which read as flickering/glitching (user feedback). Tracking is only
 * turned on for a brief moment right after this marker's own look actually
 * changes (elimination/selection), then switched back off - it still needs
 * to stay on through the very first render so the initial icon gets
 * captured at all.
 */
function FoodMarker({ spot, isEliminated, isSelected, colors, styles, onSelectSpot }) {
  const [trackChanges, setTrackChanges] = useState(true);
  useEffect(() => {
    setTrackChanges(true);
    const t = setTimeout(() => setTrackChanges(false), 300);
    return () => clearTimeout(t);
  }, [isEliminated, isSelected]);

  return (
    <Marker
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      title={spot.name}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={trackChanges}
      onPress={() => onSelectSpot(spot)}
    >
      <View style={[styles.foodPin, isEliminated && styles.foodPinOut, isSelected && styles.foodPinGlow]}>
        <Ionicons name="restaurant" size={14} color={isSelected ? colors.textDark : colors.textLight} />
      </View>
    </Marker>
  );
}

/**
 * A player's location pin. Was a bare inline <Marker> with tracksViewChanges
 * HARDCODED false from the start (reasoning: "these never change, so they
 * never need re-snapshotting") - missed that tracksViewChanges also governs
 * whether the INITIAL bitmap capture happens at all, not just re-capture on
 * change. A custom marker icon that never passes through `true` can end up
 * never actually rendering its content (user report, found via the same bug
 * in SpotsMap.js's now-fixed person pin). FoodMarker above already has the
 * correct pattern - starts true, switches to false shortly after - applied
 * here too.
 */
function PersonMarker({ location, label, pinStyle, colors, styles }) {
  const [trackChanges, setTrackChanges] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTrackChanges(false), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <Marker coordinate={location} title={label} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={trackChanges}>
      <View style={[styles.personPin, pinStyle]}>
        <Ionicons name="person" size={14} color={colors.textDark} />
      </View>
    </Marker>
  );
}

/**
 * Small preview map for the friend-spin bracket screen: both players'
 * locations plus every spot still in play, pinned above the elimination
 * list. The spot whose details were last opened glows (neon border/shadow,
 * same visual language as a selected filter chip) so it's easy to spot
 * again on the map after checking it out. `initialRegion` is computed once
 * (spots' coordinates don't move during a session, only elimination status
 * does) rather than re-fitting on every render.
 */
export default function FriendMap({
  myLocation, myLabel, friendLocation, friendLabel,
  spots, eliminatedIds, selectedSpotId, onSelectSpot,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const points = [myLocation, friendLocation, ...spots.map((s) => ({ latitude: s.lat, longitude: s.lng }))]
    .filter((p) => p && typeof p.latitude === 'number' && typeof p.longitude === 'number');
  if (points.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <MapView
        style={styles.map}
        initialRegion={regionForPoints(points)}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {myLocation && (
          <PersonMarker location={myLocation} label={myLabel} colors={colors} styles={styles} />
        )}
        {friendLocation && (
          <PersonMarker
            location={friendLocation}
            label={friendLabel}
            pinStyle={styles.friendPin}
            colors={colors}
            styles={styles}
          />
        )}
        {spots.map((spot) => {
          if (typeof spot.lat !== 'number' || typeof spot.lng !== 'number') return null;
          return (
            <FoodMarker
              key={spot.id}
              spot={spot}
              isEliminated={eliminatedIds.includes(spot.id)}
              isSelected={spot.id === selectedSpotId}
              colors={colors}
              styles={styles}
              onSelectSpot={onSelectSpot}
            />
          );
        })}
      </MapView>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  wrapper: { width: '100%', height: 180, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  map: { flex: 1 },
  personPin: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold,
    borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center',
  },
  friendPin: { backgroundColor: colors.accent },
  // elevation pinned constant (10, matching neonSelected's) whether glowing
  // or not - same fix as every other selected/unselected toggle this
  // session, Android can leave a view stuck blank after its elevation
  // changes between renders.
  foodPin: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card,
    borderWidth: 1.5, borderColor: colors.accentDark, alignItems: 'center', justifyContent: 'center',
    ...buttonDepth, elevation: 10,
  },
  foodPinOut: { opacity: 0.45 },
  foodPinGlow: { backgroundColor: colors.accent, ...neonSelected(colors) },
});
