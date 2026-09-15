import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { neonSelected, buttonDepth } from '../constants';
import { useTheme } from '../ThemeContext';
import { contrastTextColor } from '../utils/color';

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
    // zoomed-in that tight clusters look like one blob. Same tuning as
    // FriendMap's identical helper.
    latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.6),
    longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.6),
  };
}

/**
 * A food-spot marker. react-native-maps re-renders a custom marker's icon
 * into a bitmap on every parent re-render by default (`tracksViewChanges`
 * defaults to true), which reads as flickering on any screen that re-renders
 * often - tracking is only turned on for a brief moment right after this
 * marker's own look actually changes (elimination/selection), then switched
 * back off. Same component/fix as FriendMap's FoodMarker (duplicated rather
 * than shared - FriendMap is two-person-specific and this is the general
 * single-user version used everywhere else).
 */
function FoodMarker({ spot, isEliminated, isSelected, highlight, colors, styles, onSelectSpot }) {
  const [trackChanges, setTrackChanges] = useState(true);
  useEffect(() => {
    setTrackChanges(true);
    const t = setTimeout(() => setTrackChanges(false), 300);
    return () => clearTimeout(t);
  }, [isEliminated, isSelected, highlight?.color]);

  return (
    <Marker
      coordinate={{ latitude: spot.lat, longitude: spot.lng }}
      title={spot.name}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={trackChanges}
      onPress={() => onSelectSpot?.(spot)}
    >
      <View
        style={[
          styles.foodPin,
          isEliminated && styles.foodPinOut,
          isSelected && styles.foodPinGlow,
          // Flat fill only, no neonSelected ring - the ring's own color
          // (colors.neon, itself derived from the user's accent) fought with
          // each pin's own assigned ramp color and made it harder to read,
          // not easier (user report). The base foodPin border is enough to
          // keep the pin's shape defined.
          highlight && { backgroundColor: highlight.color },
        ]}
      >
        {highlight ? (
          <Text style={[styles.foodPinLabel, { color: contrastTextColor(highlight.color) }]}>
            {highlight.label}
          </Text>
        ) : (
          <Ionicons name="restaurant" size={14} color={isSelected ? colors.textDark : colors.textLight} />
        )}
      </View>
    </Marker>
  );
}

/**
 * The user's own location pin. Was a bare inline <Marker> with
 * tracksViewChanges HARDCODED false from the start - the reasoning at the
 * time ("this pin's look never changes, so it doesn't need re-tracking")
 * missed that tracksViewChanges also governs whether the INITIAL bitmap
 * capture happens at all: a custom marker icon that never passes through
 * `true` can end up never actually rendering its content (user report: no
 * person pin visible at all). FoodMarker right above already has the
 * correct fix for this - starts true, switches to false shortly after - this
 * just applies the same pattern here.
 */
function PersonMarker({ location, colors, styles }) {
  const [trackChanges, setTrackChanges] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTrackChanges(false), 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <Marker coordinate={location} title="You" anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={trackChanges}>
      <View style={styles.personPin}>
        <Ionicons name="person" size={14} color={colors.textDark} />
      </View>
    </Marker>
  );
}

/**
 * Small preview map for any results screen: the user's own location plus
 * every spot currently showing on that screen (single pick, the elimination
 * bracket, or the curated list) - user request, after noticing results could
 * be far enough (or the wrong cuisine entirely, see the unconfirmedCuisine
 * work) that seeing them plotted against your own position adds real value.
 * `initialRegion` is computed once (spot coordinates don't change) rather
 * than re-fitting on every render. Renders nothing at all if there isn't at
 * least one valid point - callers don't need to guard for that themselves.
 */
export default function SpotsMap({
  location, spots, eliminatedIds = [], selectedSpotId, highlights, onSelectSpot,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const myLocation = location && typeof location.latitude === 'number' && typeof location.longitude === 'number'
    ? location
    : null;
  const points = [myLocation, ...spots.map((s) => ({ latitude: s.lat, longitude: s.lng }))]
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
        {myLocation && <PersonMarker location={myLocation} colors={colors} styles={styles} />}
        {spots.map((spot) => {
          if (typeof spot.lat !== 'number' || typeof spot.lng !== 'number') return null;
          return (
            <FoodMarker
              key={spot.id}
              spot={spot}
              isEliminated={eliminatedIds.includes(spot.id)}
              isSelected={spot.id === selectedSpotId}
              highlight={highlights ? highlights[spot.id] : undefined}
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
  wrapper: { width: '100%', height: 160, borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  map: { flex: 1 },
  personPin: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.gold,
    borderWidth: 2, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center',
  },
  // elevation pinned constant (10) whether glowing or not - same fix as
  // every other selected/unselected toggle in this app, Android can leave a
  // view stuck blank after its elevation changes between renders.
  foodPin: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.card,
    borderWidth: 1.5, borderColor: colors.accentDark, alignItems: 'center', justifyContent: 'center',
    ...buttonDepth, elevation: 10,
  },
  foodPinOut: { opacity: 0.45 },
  foodPinGlow: { backgroundColor: colors.accent, ...neonSelected(colors) },
  foodPinLabel: { fontSize: 12, fontWeight: 'bold' },
});
