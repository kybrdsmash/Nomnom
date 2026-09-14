import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Image, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { getFoodInfo, ALLERGEN_TAGS } from '../foodInfo';
import { searchNearbyByKeyword } from '../api/places';
import { joinParts } from '../utils/format';

/**
 * Long-press detail view for a single rolling food icon - a description,
 * standard allergen/dietary symbols, a cultural background note, and a
 * button to search nearby restaurants that serve it (reuses the same
 * Nearby Search endpoint the main randomizer already uses, just with the
 * dish's name as the keyword instead of a cuisine). Description/allergen/
 * cultural content comes from src/foodInfo.js's curated batch - not every
 * dish has an entry yet, so this degrades gracefully when one's missing.
 */
export default function FoodDetailModal({ visible, food, location, travelType, onClose, onShowSpotDetails }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [nearby, setNearby] = useState([]);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [searchedNearby, setSearchedNearby] = useState(false);

  useEffect(() => {
    setNearby([]);
    setSearchedNearby(false);
    setLoadingNearby(false);
  }, [visible, food?.name]);

  if (!food) return null;
  const info = getFoodInfo(food.name);

  const findNearby = async () => {
    setLoadingNearby(true);
    // closestOnly: true (user request) - deduped by chain, ordered by
    // distance instead of review count, with anything within 0.1mi of the
    // next spot treated as tied and broken by review count - still a full
    // browsable list, not just the single nearest match. See
    // searchNearbyByKeyword.
    const results = await searchNearbyByKeyword(location, travelType, food.name, { closestOnly: true });
    setNearby(results);
    setSearchedNearby(true);
    setLoadingNearby(false);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Image source={food.image} style={styles.icon} resizeMode="contain" />
            <Text style={styles.title} numberOfLines={1}>{food.name}</Text>
            <Pressable onPress={onClose} style={{ padding: 6 }} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.accent} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {info ? (
              <>
                <Text style={styles.description}>{info.description}</Text>

                {info.allergens.length > 0 && (
                  <View style={styles.tagRow}>
                    {info.allergens.map((key) => (
                      <View key={key} style={styles.tag}>
                        <Text style={styles.tagSymbol}>{ALLERGEN_TAGS[key].symbol}</Text>
                        <Text style={styles.tagLabel}>{ALLERGEN_TAGS[key].label}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.disclaimer}>
                  General guidance based on standard preparation - recipes vary by
                  restaurant, always confirm directly if you have an allergy.
                </Text>

                <Text style={styles.sectionTitle}>Cultural Background</Text>
                <Text style={styles.description}>{info.cultural}</Text>
              </>
            ) : (
              <Text style={styles.emptyText}>
                We haven't written up {food.name} yet - still happy to help you find it nearby though!
              </Text>
            )}

            {/* Header removed - "Find It Nearby" was redundant right above a
                button that already says "Find {food.name} Near Me" (user
                request). */}
            {!searchedNearby && (
              <Pressable
                style={[styles.findBtn, !location && { opacity: 0.4 }]}
                disabled={!location || loadingNearby}
                onPress={findNearby}
              >
                {loadingNearby ? (
                  <ActivityIndicator color={colors.textDark} size="small" />
                ) : (
                  <Text style={styles.findBtnText}>
                    {location ? `Find ${food.name} Near Me` : 'Waiting on your location...'}
                  </Text>
                )}
              </Pressable>
            )}
            {searchedNearby && nearby.length === 0 && (
              <Text style={styles.emptyText}>Nothing serving this nearby right now.</Text>
            )}
            {nearby.map((spot) => (
              <Pressable key={spot.id} style={styles.nearbyRow} onPress={() => onShowSpotDetails(spot)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nearbyTitle} numberOfLines={1}>{spot.name}</Text>
                  <Text style={styles.nearbySub} numberOfLines={1}>
                    {joinParts([`⭐ ${spot.rating}`, spot.distance])}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: colors.background, borderRadius: 24, padding: 20,
    width: '88%', maxHeight: '75%', ...buttonDepth, elevation: 20,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  icon: { width: 40, height: 40, marginRight: 10 },
  title: { flex: 1, color: colors.textLight, fontSize: 19, fontWeight: 'bold' },
  description: { color: '#DDD', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  sectionTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 14, marginBottom: 6, marginTop: 4 },
  emptyText: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', marginBottom: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  tag: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginRight: 8, marginBottom: 8,
  },
  tagSymbol: { fontSize: 14, marginRight: 4 },
  tagLabel: { color: colors.textLight, fontSize: 12, fontWeight: '600' },
  disclaimer: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', lineHeight: 15, marginBottom: 14 },
  findBtn: {
    backgroundColor: colors.accent, borderRadius: 20, paddingVertical: 10,
    alignItems: 'center', marginBottom: 10, ...buttonDepth,
  },
  findBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 13 },
  nearbyRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 12, padding: 10, marginBottom: 8,
  },
  nearbyTitle: { color: colors.textLight, fontSize: 14, fontWeight: '600' },
  nearbySub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
});
