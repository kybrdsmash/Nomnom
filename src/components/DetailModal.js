import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, Pressable, Image, ScrollView, TextInput,
  ActivityIndicator, StyleSheet, Linking, Share, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { buttonDepth } from '../constants';
import { fetchPlaceDetails } from '../api/details';
import { isFirebaseConfigured } from '../api/firebase';
import { fetchFriendJournal } from '../api/journal';
import { joinParts } from '../utils/format';
import FullscreenImageViewer from './FullscreenImageViewer';
import MomentsEditor, { newMoment } from './MomentsEditor';
import { getMichelinEntry } from '../michelinList';

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
  onOpenInvite,
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
  // Only ever set alongside a friend's sharedPhotoUrl below - your own
  // photos (from "Journal") don't need attribution.
  const [fullscreenEntryPhotoCaption, setFullscreenEntryPhotoCaption] = useState(null);
  // A journal entry's own moment photos ({ photos, noteTexts, initialIndex }
  // or null) - separate from fullscreenEntryPhoto above since this can be
  // MULTIPLE photos swiped through together, each with its own carried-
  // forward note text (user request: "the text also needs to move with the
  // image in full screen... keep that text blurb on screen for the next
  // photos assuming no additional detail is provided" - see openMomentPhotos).
  const [fullscreenMomentsView, setFullscreenMomentsView] = useState(null);

  // "Your Review" compose state - editingEntryId null means composing a
  // brand-new entry, otherwise it's the id of the existing entry being fixed
  // up (see onEditJournalEntry - a late/days-later writeup can be corrected
  // afterward, per user request).
  const [composing, setComposing] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [draftRating, setDraftRating] = useState(0);
  // Same moments shape as AtTheTableCompose/MomentsEditor now (user request:
  // "Journal"'s own compose box needs the same multi-photo/multi-text
  // format, not the old single note + single photo) - a leading note plus
  // any number of photo+text blocks after it.
  const [draftMoments, setDraftMoments] = useState([newMoment()]);
  const [expanded, setExpanded] = useState(false);
  // Both sections start collapsed as slim header rows (user request) - tap
  // the row (or its chevron) to reveal the compose box/entries beneath it.
  const [journalSectionOpen, setJournalSectionOpen] = useState(false);
  const [friendsSectionOpen, setFriendsSectionOpen] = useState(false);
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
    setJournalSectionOpen(false);
    setFriendsSectionOpen(false);
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
    setDraftMoments([newMoment()]);
    setComposing(true);
    setJournalSectionOpen(true);
  };
  const startEdit = (entry) => {
    setEditingEntryId(entry.id);
    setDraftRating(entry.rating);
    // Old entries (before this form used moments) only ever had a single
    // flat note/photoUri - converted into a one-moment array here so the
    // SAME editor can open either shape without the entry itself needing a
    // migration.
    setDraftMoments(
      entry.moments?.length > 0
        ? entry.moments
        : [{ id: entry.id, text: entry.note || '', photoUri: entry.photoUri || null }]
    );
    setComposing(true);
    setJournalSectionOpen(true);
  };
  const submitFeedback = () => {
    if (draftRating === 0) return;
    const moments = draftMoments.filter((m) => m.text.trim() || m.photoUri);
    if (editingEntryId) {
      // Note: if this entry's photo is already shared and a photo changes
      // here, the shared copy isn't auto-refreshed - toggling share off/on
      // again re-uploads the new one. Deliberate: re-sharing needs an
      // explicit tap rather than silently swapping what a friend sees.
      onEditJournalEntry(spot.id, editingEntryId, { rating: draftRating, moments });
    } else {
      onAddJournalEntry(spot.id, {
        rating: draftRating,
        moments,
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

  // Opens every photo in this entry together, swipeable, each paired with
  // its own text - or, if a later photo has none, the last real one it
  // passed (user request: "keep that text blurb on screen for the next
  // photos assuming no additional detail is provided"). Walks ALL moments in
  // order (not just the photo-having ones) so a leading text-only moment's
  // note still carries into the first photo after it.
  const openMomentPhotos = (entryMoments, tappedPhotoUri) => {
    let lastText = '';
    const photos = [];
    const noteTexts = [];
    entryMoments.forEach((m) => {
      if (m.text && m.text.trim()) lastText = m.text.trim();
      if (m.photoUri) {
        photos.push(m.photoUri);
        noteTexts.push(lastText);
      }
    });
    setFullscreenMomentsView({ photos, noteTexts, initialIndex: Math.max(0, photos.indexOf(tappedPhotoUri)) });
  };

  // "At the Table" entries (AtTheTableCompose) and reviews made through this
  // form's own MomentsEditor both use `moments` - an ordered
  // [{ text, photoUri }] - instead of the old single rating/note/photoUri.
  // Sideways-scrolling, photo-on-top/text-below cards, one per moment.
  const renderMomentEntry = (entry) => (
    <View key={entry.id} style={styles.momentEntryBlock}>
      <View style={styles.momentEntryHeaderRow}>
        <View style={{ flex: 1 }}>
          {/* Only present on a real review (this form's own compose box) -
              "At the Table" entries deliberately have no rating. */}
          {typeof entry.rating === 'number' && (
            <Text style={styles.entryRating}>{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</Text>
          )}
          {!!entry.occasion && <Text style={styles.entryOccasion}>{entry.occasion}</Text>}
        </View>
        <Pressable onPress={() => startEdit(entry)} hitSlop={8}>
          <Ionicons name="pencil" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
      {/* snapToInterval, not pagingEnabled - pagingEnabled snaps by the
          ScrollView's own full width, which is much wider than one 120px
          card (momentCard's 110 + marginRight's 10), so it'd jump several
          cards per swipe instead of snapping to each one individually. */}
      <ScrollView
        horizontal
        snapToInterval={120}
        decelerationRate="fast"
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        style={styles.momentReel}
        contentContainerStyle={{ paddingRight: 14 }}
      >
        {entry.moments.map((moment, i) => (
          <View key={i} style={styles.momentCard}>
            {moment.photoUri ? (
              <Pressable onPress={() => openMomentPhotos(entry.moments, moment.photoUri)}>
                <Image source={{ uri: moment.photoUri }} style={styles.momentCardPhoto} />
              </Pressable>
            ) : (
              <View style={[styles.momentCardPhoto, styles.momentCardPhotoEmpty]}>
                <Ionicons name="chatbox-ellipses-outline" size={22} color={colors.textMuted} />
              </View>
            )}
            {!!moment.text && (
              <Text style={styles.momentCardText} numberOfLines={5}>{moment.text}</Text>
            )}
          </View>
        ))}
      </ScrollView>
      <Text style={styles.entryDate}>
        Logged {relativeTime(entry.createdAt)}
        {entry.updatedAt !== entry.createdAt ? ` · edited ${relativeTime(entry.updatedAt)}` : ''}
      </Text>
    </View>
  );

  const renderEntryRow = (entry) => {
    if (entry.moments) return renderMomentEntry(entry);

    return (
      <View key={entry.id} style={styles.entryRow}>
        {entry.photoUri && (
          <Pressable onPress={() => {
            setFullscreenEntryPhoto(entry.photoUri);
            setFullscreenEntryPhotoCaption(null);
          }}>
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
  };

  // Google's documented "Search action" Maps URL (place_id pins the exact
  // spot, not just a name match) - a friend opening this link gets the same
  // address/rating/hours/photos view Google normally shows, no app needed.
  const mapsShareUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}&query_place_id=${spot.id}`;
  const shareSpot = () => {
    Share.share({ message: `${spot.name}\n${mapsShareUrl}` });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Same fix, same reasoning, as ReportBugModal - this Modal is a fresh
          subtree at the screen root, so KeyboardAvoidingView's math works
          correctly here (it computes its shift relative to its own
          immediate parent, which breaks when nested deep inside an offset
          container - see ReportBugModal's own docstring). Without this, the
          compose box scrolled low enough in "Journal" got covered by the
          keyboard with no way to see what was being typed (user report). */}
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>{spot.name}</Text>
            <Pressable onPress={onClose} style={{ padding: 6 }}>
              <Ionicons name="close" size={26} color={colors.accent} />
            </Pressable>
          </View>
          <Text style={styles.subtitle}>{joinParts([`⭐ ${spot.rating}`, spot.type, spot.blurb])}</Text>

          {/* Icon-only, not icon+label (user request: "they don't need to
              have the text next to them... so all of the icons can be on
              the same line") - matches ResultCard's own iconBtn row, which
              already does this. */}
          <View style={styles.actionRow}>
            <Pressable style={styles.actionBtn} onPress={onToggleFavorite}>
              <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color={colors.danger} />
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={onToggleTryLater}>
              <Ionicons name={isTryLater ? 'bookmark' : 'bookmark-outline'} size={22} color={colors.gold} />
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={shareSpot}>
              <Ionicons name="share-social-outline" size={22} color={colors.accent} />
            </Pressable>
            {/* Distinct from Share above - Share hands off a plain Google
                Maps link through the OS share sheet (any app, no app-side
                record); Send goes through InviteFriendModal to a specific
                friend already in your list, with a proposed date/time
                attached (user request). */}
            {onOpenInvite && (
              <Pressable style={styles.actionBtn} onPress={onOpenInvite}>
                <Ionicons name="paper-plane-outline" size={22} color={colors.accent} />
              </Pressable>
            )}
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

              {/* $$$$ only, and only when Google actually has one - see
                  details.js's own note: this is Google's generic written
                  blurb, NOT a Michelin/award field (no such structured data
                  exists), so it's genuinely hit-or-miss whether it says
                  anything notable at all. Shown here as a first look at what
                  it actually looks like in practice (user request). */}
              {spot.priceLevel === 4 && !!details.editorialSummary && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>About</Text>
                  <Text style={styles.hoursLine}>{details.editorialSummary}</Text>
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
                {/* Starts collapsed as a slim row - tap it (or the chevron)
                    to reveal the compose box/entries below (user request).
                    The pencil is its own touch target, separate from the
                    row's toggle, so starting a new entry doesn't also
                    require a second tap to expand first. */}
                <Pressable
                  style={styles.feedbackHeaderRow}
                  onPress={() => setJournalSectionOpen((v) => !v)}
                >
                  <Text style={styles.sectionTitle}>
                    Journal{myEntries.length > 0 ? ` (${myEntries.length})` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Pressable onPress={startAdd} hitSlop={8} style={{ marginRight: 12 }}>
                      <Ionicons name="create-outline" size={20} color={colors.accent} />
                    </Pressable>
                    <Ionicons
                      name={journalSectionOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textMuted}
                    />
                  </View>
                </Pressable>

                {journalSectionOpen && composing && (
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
                    {/* Same editor AtTheTableCompose uses (user request -
                        this form needed the same multi-photo/multi-text
                        format, not the old single note + single photo). */}
                    <MomentsEditor
                      moments={draftMoments}
                      onChangeMoments={setDraftMoments}
                      firstPlaceholder="Notable details about the food..."
                    />
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

                {journalSectionOpen && !composing && myEntries.length === 0 && (
                  <Text style={styles.emptyFeedbackText}>No feedback yet - tap the pencil to add some.</Text>
                )}

                {journalSectionOpen && !composing && myEntries.length > 0 && (
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
                  <Pressable
                    style={styles.feedbackHeaderRow}
                    onPress={() => setFriendsSectionOpen((v) => !v)}
                  >
                    <Text style={styles.sectionTitle}>Friends' Feedback ({friendEntries.length})</Text>
                    <Ionicons
                      name={friendsSectionOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>
                  {friendsSectionOpen && friendEntries.map((e, i) => (
                    <View key={i} style={styles.friendFeedbackRow}>
                      {/* sharedPhotoUrl only - never a friend's local
                          photoUri, which wouldn't resolve on this device
                          anyway and is stripped before syncing (App.js). */}
                      {e.photoShared && e.sharedPhotoUrl && (
                        <Pressable onPress={() => {
                          setFullscreenEntryPhoto(e.sharedPhotoUrl);
                          setFullscreenEntryPhotoCaption(`Shared by ${e.name}`);
                        }}>
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
      </KeyboardAvoidingView>

      <FullscreenImageViewer
        visible={fullscreenIndex !== null}
        photos={details?.photos || []}
        initialIndex={fullscreenIndex || 0}
        onClose={() => setFullscreenIndex(null)}
      />
      <FullscreenImageViewer
        visible={fullscreenEntryPhoto !== null}
        photos={fullscreenEntryPhoto ? [fullscreenEntryPhoto] : []}
        caption={fullscreenEntryPhotoCaption}
        onClose={() => setFullscreenEntryPhoto(null)}
      />
      {/* A journal entry's own moments, swipeable together - see
          openMomentPhotos above for how photos/noteTexts get built. */}
      <FullscreenImageViewer
        visible={fullscreenMomentsView !== null}
        photos={fullscreenMomentsView?.photos || []}
        initialIndex={fullscreenMomentsView?.initialIndex || 0}
        noteTexts={fullscreenMomentsView?.noteTexts}
        onClose={() => setFullscreenMomentsView(null)}
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
  // flexWrap, not a fixed single line - 4 labeled pills (Favorite/Favorited,
  // Try later/On Try list, Share, Send) don't reliably fit one row on a
  // narrower phone; wrapping to a second row keeps every button fully
  // tappable instead of clipping or letting them crowd together (user
  // request: spaced out enough that they can't get hit by accident).
  // Icon-only circles now (user request) - a plain row fits all 4 on one
  // line at this size, no flexWrap needed like the old text-pill version.
  actionRow: { flexDirection: 'row', marginTop: 14 },
  actionBtn: { backgroundColor: colors.card, borderRadius: 22, padding: 10, marginRight: 12, ...buttonDepth },
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
  entryRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8 },
  entryPhoto: { width: 48, height: 48, borderRadius: 8, marginRight: 10, backgroundColor: '#333' },
  entryRating: { color: colors.gold, fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  entryNote: { color: '#DDD', fontSize: 13, lineHeight: 18, marginBottom: 4 },
  entryDate: { color: colors.textMuted, fontSize: 11 },
  // "At the Table" entries (moments) - a horizontal reel instead of the
  // stacked photo+text layout above (user request: "sideways scrolling
  // format... picture is atop and text is below, split up by image").
  momentEntryBlock: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8 },
  momentEntryHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  entryOccasion: { color: colors.accent, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  // Smaller than a first pass at this (was 160) - a full-size preview isn't
  // the point here, just enough to recognize it; tapping goes fullscreen for
  // anyone who actually wants to look closer (user request).
  momentReel: { marginBottom: 6 },
  momentCard: { width: 110, marginRight: 10 },
  momentCardPhoto: { width: 110, height: 110, borderRadius: 10, backgroundColor: '#333' },
  momentCardPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  momentCardText: { color: '#DDD', fontSize: 12, lineHeight: 17, marginTop: 6 },
  shareToggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  shareToggleText: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginLeft: 5 },
  expandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  expandText: { color: colors.accent, fontSize: 12, fontWeight: '600', marginRight: 4 },
  friendFeedbackRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  friendFeedbackLine: { color: '#DDD', fontSize: 13, lineHeight: 20, flex: 1 },
});
