import React, { useEffect, useState } from 'react';
import { Modal, View, Image, Pressable, Text, StyleSheet, FlatList, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Fullscreen tap-to-expand / tap-to-shrink-back photo viewer, shared by
 * every spot-photo location in the app (detail modal, result card,
 * elimination rows, history/favorites, browse list). Pass a `photos` array
 * (even for a single image, wrap it in a 1-item array) + which one was
 * tapped as `initialIndex` - if there's more than one, it's swipeable.
 * Tapping the image, the backdrop, or the close button all dismiss it.
 */
export default function FullscreenImageViewer({ visible, photos, initialIndex = 0, onClose }) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  if (!photos || photos.length === 0) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <FlatList
          data={photos}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <Pressable style={[styles.page, { width }]} onPress={onClose}>
              <Image
                source={{ uri: item }}
                style={{ width: width - 32, height: height * 0.7 }}
                resizeMode="contain"
              />
            </Pressable>
          )}
        />
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={16}>
          <Ionicons name="close" size={30} color="#FFF" />
        </Pressable>
        {photos.length > 1 && (
          <View style={styles.counter} pointerEvents="none">
            <Text style={styles.counterText}>{index + 1} / {photos.length}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  page: { alignItems: 'center', justifyContent: 'center' },
  closeBtn: { position: 'absolute', top: 50, right: 20, padding: 8 },
  counter: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
  },
  counterText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
});
