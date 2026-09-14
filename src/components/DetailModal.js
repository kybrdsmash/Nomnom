import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, Pressable, Image, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, Linking, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { fetchPlaceDetails } from '../api/details';
import { isFirebaseConfigured } from '../api/firebase';
import { fetchFriendJournal } from '../api/journal';
import { joinParts } from '../utils/format';
import FullscreenImageViewer from './FullscreenImageViewer';

// The picker's own returned URI can sit in a cache directory the OS is free
// to evict under storage pressure - copying it into the app's document
// directory first means an attached photo doesn't silently go missing later.
async function pickAndPersistPhoto() {
  // mediaTypes omitted - 'images' is already the default, and the old
  // MediaTypeOptions enum this SDK version shipped before is deprecated.
  const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
  if (result.canceled || !result.assets?.[0]) return null;
  const dest = new File(Paths.document, `journal-photo-${Date.now()}.jpg`);
  new File(result.assets[0].uri).copy(dest);
  return dest.uri;
}

// "3m ago" / "5h ago" / "2d ago" / a full date past a month - used for both
// "logged" and "edited" timestamps on a journal entry.
function relativeTime(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Slide-up detail view for one spot: extra photos, recent reviews, hours,
 * website/phone links, plus quick actions (favorite, try later). The Place
 * Details API call happens ONLY when this opens - never in bulk.
 */
export default function DetailModal({
  spot,
  visible,
  onClose,
  isFavorite,
  onToggleFavorite,
  isTryLater,
  onToggleTryLater,
  onOpenDirections,
  journal,
  onAddJournalEntry,
  onEditJournalEntry,
  onDeleteJournalEntry,
  onToggleEntryPhotoShare,
  friends,
}) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  // Which photo (by index) is currently blown up fullscreen - null when closed.
  const [fullscreenIndex, setFullscreenIndex] = useState(null);
  // Separate from fullscreenIndex above (which indexes into Google's
  // details.photos array) - this is a single journal-entry photo (local or a
  // friend's shared one), addressed directly by URI rather than by index.
  const [fullscreenEntryPhoto, setFullscreenEntryPhoto] = useState(null);

  // "Your Review" compose state - editingEntryId null means composing a
  // brand-new entry, otherwise it's the id of the existing entry being fixed
  // up (see onEditJournalEntry - a late/days-later writeup can be corrected
  // afterward, per user request).
  const [composing, setComposing] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [draftRating, setDraftRating] = useState(0);
  const [draftNote, setDraftNote] = useState('');
  const [draftPhotoUri, setDraftPhotoUri] = useState(null);
  const [expanded, setExpanded] = useState(false);
  // Per-entry "sharing/unsharing right now" state, keyed by entry id - purely
  // to disable that entry's toggle mid-request (the upload/delete itself is
  // a network call) rather than letting a second tap fire while one's still
  // in flight.
  const [sharingEntryId, setSharingEntryId] = useState(null);
  // Most recent entry per friend who's rated this exact spot, fetched fresh
  // each time this modal opens (bounded by friend count - simplest v1, not
  // a live subscription).
  const [friendEntries, setFriendEntries] = useState([]);

  useEffect(() => {
    if (visible && spot) {
      setLoading(true);
      setDetails(null);
      fetchPlaceDetails(spot.id).then((d) => {
        setDetails(d);
        setLoading(false);
      });
    }
  }, [visible, spot?.id]);

  useEffect(() => {
    setComposing(false);
    setEditingEntryId(null);
    setExpanded(false);
  }, [visible, spot?.id]);

  useEffect(() => {
    if (!visible || !spot || !isFirebaseConfigured || !friends || friends.length === 0) {
      setFriendEntries([]);
      return;
    }
    let cancelled = false;
    Promise.all(friends.map(async (f) => {
      const entries = await fetchFriendJournal(f.uid);
      const list = entries[spot.id];
      return list && list.length > 0 ? { name: f.name, ...list[0] } : null;
    })).then((results) => {
      if (!cancelled) setFriendEntries(results.filter(Boolean));
    });
    return () => { cancelled = true; };
  }, [visible, spot?.id, friends]);

  if (!spot) return null;

  // Sorted by updatedAt (not just array order) - editing an older entry
  // bumps its updatedAt without moving it in storage, so relying on array
  // position alone could show a stale entry as "most recent."
  const myEntries = ((journal && journal[spot.id]) || [])
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const startAdd = () => {
    setEditingEntryId(null);
    setDraftRating(0);
    setDraftNote('');
    setDraftPhotoUri(null);
    setComposing(true);
  };
  const startEdit = (entry) => {
    setEditingEntryId(entry.id);
    setDraftRating(entry.rating);
    setDraftNote(entry.note);
    setDraftPhotoUri(entry.photoUri || null);
    setComposing(true);
  };
  const attachPhoto = async () => {
    const uri = await pickAndPersistPhoto();
    if (uri) setDraftPhotoUri(uri);
  };
  const submitFeedback = () => {
    if (draftRating === 0) return;
    if (editingEntryId) {
      // Note: if this entry's photo is already shared and the photo changes
      // here, the shared copy isn't auto-refreshed - toggling share off/on
      // again re-uploads the new one. Deliberate: re-sharing needs an
      // explicit tap rather than silently swapping what a friend sees.
      onEditJournalEntry(spot.id, editingEntryId, { rating: draftRating, note: draftNote.trim(), photoUri: draftPhotoUri });
    } else {
      onAddJournalEntry(spot.id, {
        rating: draftRating,
        note: draftNote.trim(),
        photoUri: draftPhotoUri,
        spot: {
          id: spot.id, name: spot.name, lat: spot.lat, lng: spot.lng,
          rating: spot.rating, type: spot.type, blurb: spot.blurb, photoUrl: spot.photoUrl,
          // Needed for groupByCity (utils/location.js) - without this every
          // journal entry showed "Unknown Location" regardless of where it
          // actually came from (user feedback).
          address: spot.address,
        },
      });
    }
    setComposing(false);
  };

  // Only reachable while editing an existing entry (the X only renders
  // then, see below) - a brand-new, not-yet-saved draft is discarded via
  // Cancel instead, deleting nothing.
  const deleteFeedback = () => {
    onDeleteJournalEntry(spot.id, editingEntryId);
    setComposing(false);
    setEditingEntryId(null);
  };

  const shareThisPhoto = async (entry) => {
    setSharingEntryId(entry.id);
    try {
      await onToggleEntryPhotoShare(spot.id, entry.id);
    } finally {
      setSharingEntryId(null);
    }
  };

  const renderEntryRow = (entry) => (
    <View key={entry.id} style={styles.entryRow}>
      {entry.photoUri && (
        <Pressable onPress={() => setFullscreenEntryPhoto(entry.photoUri)}>
          <Image source={{ uri: entry.photoUri }} style={styles.entryPhoto} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.entryRating}>{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</Text>
        {!!entry.note && <Text style={styles.entryNote}>{entry.note}</Text>}
        <Text style={styles.entryDate}>
          Logged {relativeTime(entry.createdAt)}
          {entry.updatedAt !== entry.createdAt ? ` · edited ${relativeTime(entry.updatedAt)}` : ''}
        </Text>
        {entry.photoUri && (
          <Pressable
            style={styles.shareToggleRow}
            onPress={() => shareThisPhoto(entry)}
            disabled={sharingEntryId === entry.id}
            hitSlop={4}
          >
            {sharingEntryId === entry.id ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Ionicons
                name={entry.photoShared ? 'people' : 'people-outline'}
                size={14}
                color={entry.photoShared ? colors.accent : colors.textMuted}
              />
            )}
            <Text style={[styles.shareToggleText, entry.photoShared && { color: colors.accent }]}>
              {entry.photoShared ? 'Visible to friends' : 'Only visible to you'}
            </Text>
          </Pressable>
        )}
      </View>
      <Pressable onPress={() => startEdit(entry)} hitSlop={8}>
        <Ionicons name="pencil" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  // Google's documented "Search action" Maps URL (place_id pins the exact
  // spot, not just a name match) - a friend opening this link gets the same
  // address/rating/hours/photos view Google normally shows, no app needed.
  const mapsShareUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}&query_place_id=${spot.id}`;
  const shareSpot = () => {
    Share.share({ message: `${spot.name}\n${mapsShareUrl}` });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>{spot.name}</Text>
            <Pressable onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={26} color={colors.accent} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{joinParts([`⭐ ${spot.rating}`, spot.type, spot.blurb])}</Text>

          <View style={styles.actionRow}>
            <Pressable style={styles.actionBtn} onPress={onToggleFavorite}>
              <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={20} color={colors.danger} />
              <Text style={styles.actionText}>{isFavorite ? 'Favorited' : 'Favorite'}</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={onToggleTryLater}>
              <Ionicons name={isTryLater ? 'bookmark' : 'bookmark-outline'} size={20} color={colors.gold} />
              <Text style={styles.actionText}>{isTryLater ? 'On Try list' : 'Try later'}</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={shareSpot}>
              <Ionicons name="share-social-outline" size={20} color={colors.accent} />
              <Text style={styles.actionText}>Share</Text>
            </Pressable>
          </View>

          {loading && <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 30 }} />}

          {!loading && !details && (
            <Text style={styles.emptyText}>Couldn't load extra details right now.</Text>
          )}

          {!loading && details && (
            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 10 }}>
              {details.photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  {details.photos.map((uri, i) => (
                    <Pressable key={i} onPress={() => setFullscreenIndex(i)}>
                      <Image source={{ uri }} style={styles.photo} />
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {spot.priceLevel != null && spot.priceLevel > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Price Range</Text>
                  <Text style={styles.hoursLine}>{'$'.repeat(spot.priceLevel)}</Text>
                </View>
              )}

              {details.hours.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Hours {details.openNow != null && (details.openNow ? '· Open now' : '· Closed now')}
                  </Text>
                  {details.hours.map((line, i) => (
                    <Text key={i} style={styles.hoursLine}>{line}</Text>
                  ))}
                </View>
              )}

              {(details.website || details.phone || true) && (
                <View style={[styles.section, { flexDirection: 'row', flexWrap: 'wrap' }]}>
                  <Pressable style={[styles.linkBtn, { marginBottom: 8 }]} onPress={onOpenDirections}>
                    <Ionicons name="navigate" size={18} color={colors.textDark} />
                    <Text style={styles.linkText}>Directions</Text>
                  </Pressable>
                  {details.website && (
                    <Pressable style={[styles.linkBtn, { marginBottom: 8 }]} onPress={() => Linking.openURL(details.website)}>
                      <Ionicons name="globe-outline" size={18} color={colors.textDark} />
                      <Text style={styles.linkText}>Website</Text>
                    </Pressable>
                  )}
                  {details.phone && (
                    <Pressable style={[styles.linkBtn, { marginBottom: 8 }]} onPress={() => Linking.openURL(`tel:${details.phone}`)}>
                      <Ionicons name="call-outline" size={18} color={colors.textDark} />
                      <Text style={styles.linkText}>{details.phone}</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Search-based deep links (no exact-menu API for either service) -
                  opens the app if installed, otherwise falls back to web search
                  for this restaurant's name. */}
              <View style={[styles.section, { flexDirection: 'row', flexWrap: 'wrap' }]}>
                <Pressable
                  style={[styles.linkBtn, { marginBottom: 8, backgroundColor: '#EB1700' }]}
                  onPress={() => Linking.openURL(`https://www.doordash.com/search/store/${encodeURIComponent(spot.name)}/`)}
                >
                  <Ionicons name="bicycle-outline" size={18} color="#FFF" />
                  <Text style={[styles.linkText, { color: '#FFF' }]}>DoorDash</Text>
                </Pressable>
                <Pressable
                  style={[styles.linkBtn, { marginBottom: 8, backgroundColor: '#06C167' }]}
                  onPress={() => Linking.openURL(`https://www.ubereats.com/search?q=${encodeURIComponent(spot.name)}`)}
                >
                  <Ionicons name="bicycle-outline" size={18} color="#FFF" />
                  <Text style={[styles.linkText, { color: '#FFF' }]}>Uber Eats</Text>
                </Pressable>
              </View>

              <View style={styles.section}>
                <View style={styles.feedbackHeaderRow}>
                  <Text style={styles.sectionTitle}>Your Reviews</Text>
                  <Pressable onPress={startAdd} hitSlop={8}>
                    <Ionicons name="create-outline" size={20} color={colors.accent} />
                  </Pressable>
                </View>

                {composing && (
                  <View style={styles.composeBox}>
                    <Text style={styles.scaleHint}>
                      Food only - not service, decor, or wait · 3 = would eat again if
                      convenient · 4 = good · 5 = excellent · ≤2 = skip it
                    </Text>
                    <View style={styles.starRow}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Pressable key={n} onPress={() => setDraftRating(n)} hitSlop={4}>
                          <Ionicons
                            name={n <= draftRating ? 'star' : 'star-outline'}
                            size={28}
                            color={colors.gold}
                            style={{ marginRight: 4 }}
                          />
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      style={styles.noteInput}
                      value={draftNote}
                      onChangeText={setDraftNote}
                      placeholder="Notable details about the food..."
                      placeholderTextColor={colors.textMuted}
                      multiline
                    />
                    <View style={styles.photoAttachRow}>
                      {draftPhotoUri ? (
                        <>
                          <Image source={{ uri: draftPhotoUri }} style={styles.draftPhotoThumb} />
                          <Pressable style={styles.photoAttachBtn} onPress={attachPhoto}>
                            <Text style={styles.photoAttachText}>Change photo</Text>
                          </Pressable>
                          <Pressable onPress={() => setDraftPhotoUri(null)} hitSlop={8} style={{ marginLeft: 8 }}>
                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                          </Pressable>
                        </>
                      ) : (
                        <Pressable style={styles.photoAttachBtn} onPress={attachPhoto}>
                          <Ionicons name="camera-outline" size={16} color={colors.accent} />
                          <Text style={styles.photoAttachText}>Add a photo</Text>
                        </Pressable>
                      )}
                    </View>
                    {/* Stays private by default - only visible to you until
                        the "Visible to friends" toggle on the saved entry
                        below is explicitly tapped. */}
                    {!!draftPhotoUri && (
                      <Text style={styles.photoPrivacyHint}>Only visible to you until you share it</Text>
                    )}
                    <View style={styles.composeButtonRow}>
                      <View style={{ flexDirection: 'row' }}>
                        <Pressable
                          style={[styles.linkBtn, { opacity: draftRating > 0 ? 1 : 0.4 }]}
                          disabled={draftRating === 0}
                          onPress={submitFeedback}
                        >
                          <Text style={styles.linkText}>{editingEntryId ? 'Save Changes' : 'Save'}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.linkBtn, { backgroundColor: colors.cardAlt, marginLeft: 8 }]}
                          onPress={() => setComposing(false)}
                        >
                          <Text style={[styles.linkText, { color: colors.textLight }]}>Cancel</Text>
                        </Pressable>
                      </View>
                      {/* Only for an existing entry being edited - a brand-new
                          draft has nothing to delete yet, Cancel covers it. */}
                      {editingEntryId && (
                        <Pressable onPress={deleteFeedback} hitSlop={8}>
                          <Ionicons name="close" size={22} color={colors.danger} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}

                {!composing && myEntries.length === 0 && (
                  <Text style={styles.emptyFeedbackText}>No feedback yet - tap the pencil to add some.</Text>
                )}

                {!composing && myEntries.length > 0 && (
                  <>
                    {renderEntryRow(myEntries[0])}
                    {myEntries.length > 1 && (
                      <Pressable style={styles.expandRow} onPress={() => setExpanded((e) => !e)}>
                        <Text style={styles.expandText}>
                          {expanded ? 'Hide' : `${myEntries.length - 1} more`}
                        </Text>
                        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.accent} />
                      </Pressable>
                    )}
                    {expanded && myEntries.slice(1).map((e) => renderEntryRow(e))}
                  </>
                )}
              </View>

              {friendEntries.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Friends' Feedback</Text>
                  {friendEntries.map((e, i) => (
                    <View key={i} style={styles.friendFeedbackRow}>
                      {/* sharedPhotoUrl only - never a friend's local
                          photoUri, which wouldn't resolve on this device
                          anyway and is stripped before syncing (App.js). */}
                      {e.photoShared && e.sharedPhotoUrl && (
                        <Pressable onPress={() => setFullscreenEntryPhoto(e.sharedPhotoUrl)}>
                          <Image source={{ uri: e.sharedPhotoUrl }} style={styles.entryPhoto} />
                        </Pressable>
                      )}
                      <Text style={styles.friendFeedbackLine}>
                        {e.name} ⭐{e.rating}{e.note ? ` - "${e.note}"` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {details.reviews.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recent reviews</Text>
                  {details.reviews.map((rev, i) => (
                    <View key={i} style={styles.reviewCard}>
                      <Text style={styles.reviewMeta}>
                        ⭐ {rev.rating} · {rev.author} · {rev.timeAgo}
                      </Text>
                      <Text style={styles.reviewText} numberOfLines={4}>{rev.text}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>

      <FullscreenImageViewer
        visible={fullscreenIndex !== null}
        photos={details?.photos || []}
        initialIndex={fullscreenIndex || 0}
        onClose={() => setFullscreenIndex(null)}
      />
      <FullscreenImageViewer
        visible={fullscreenEntryPhoto !== null}
        photos={fullscreenEntryPhoto ? [fullscreenEntryPhoto] : []}
        onClose={() => setFullscreenEntryPhoto(null)}
      />
    </Modal>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.textLight, fontSize: 22, fontWeight: 'bold', flex: 1, paddingRight: 10 },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  actionRow: { flexDirection: 'row', marginTop: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, marginRight: 10, ...buttonDepth },
  actionText: { color: colors.textLight, marginLeft: 6, fontWeight: '600', fontSize: 13 },
  emptyText: { color: colors.textMuted, textAlign: 'center', marginTop: 30, fontStyle: 'italic' },
  photo: { width: 180, height: 120, borderRadius: 12, marginRight: 10, backgroundColor: '#333' },
  section: { marginBottom: 16 },
  sectionTitle: { color: colors.accent, fontWeight: 'bold', fontSize: 15, marginBottom: 6 },
  hoursLine: { color: '#CCC', fontSize: 13, lineHeight: 20 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, marginRight: 10, ...buttonDepth },
  linkText: { color: colors.textDark, marginLeft: 6, fontWeight: 'bold', fontSize: 13 },
  reviewCard: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 10 },
  reviewMeta: { color: colors.accent, fontSize: 12, marginBottom: 4 },
  reviewText: { color: '#DDD', fontSize: 13, lineHeight: 18 },
  feedbackHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  emptyFeedbackText: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  composeBox: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8 },
  composeButtonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  scaleHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 10 },
  starRow: { flexDirection: 'row', marginBottom: 10 },
  noteInput: {
    color: colors.textLight, fontSize: 13, backgroundColor: colors.cardAlt, borderRadius: 10,
    padding: 10, minHeight: 60, textAlignVertical: 'top',
  },
  photoAttachRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  photoAttachBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardAlt, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  photoAttachText: { color: colors.accent, fontSize: 12, fontWeight: '600', marginLeft: 6 },
  draftPhotoThumb: { width: 44, height: 44, borderRadius: 8, marginRight: 8, backgroundColor: '#333' },
  photoPrivacyHint: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 6 },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8 },
  entryPhoto: { width: 48, height: 48, borderRadius: 8, marginRight: 10, backgroundColor: '#333' },
  entryRating: { color: colors.gold, fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  entryNote: { color: '#DDD', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  entryDate: { color: colors.textMuted, fontSize: 11 },
  shareToggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  shareToggleText: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginLeft: 5 },
  expandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  expandText: { color: colors.accent, fontSize: 12, fontWeight: '600', marginRight: 4 },
  friendFeedbackRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  friendFeedbackLine: { color: '#DDD', fontSize: 13, lineHeight: 20, flex: 1 },
});
