import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ActivityIndicator,
  Image, ScrollView, StyleSheet, Share, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { neonSelected, buttonDepth } from '../constants';
import { joinParts } from '../utils/format';
import {
  createSession, joinSession, startPlaying, eliminateSpot,
  requestNewBracket, watchSession, midpoint, milesBetween,
  sendPing, createDirectInvite,
} from '../api/friendSession';
import { fetchLocalFood, searchNearbyByKeyword } from '../api/places';
import { isFirebaseConfigured, ensureSignedIn } from '../api/firebase';
import {
  loadActiveFriendSession, saveActiveFriendSession, clearActiveFriendSession,
  loadScheduleArchive, saveScheduleArchive,
} from '../storage';
import { fetchFeedPhotos } from '../api/feedPhotos';
import ResultCard from './ResultCard';
import ScheduleMealModal from './ScheduleMealModal';
import FriendMap from './FriendMap';
import FullscreenImageViewer from './FullscreenImageViewer';

/**
 * "Feast with Friends": a food photo feed (currently seeded from everyone's
 * real searches - see feedPhotos.js - rather than user posts/reviews, which
 * are the actual future vision) sits in front of "Spin with a friend" - host
 * creates a session and shares a 4-letter code (as a tappable join link, via
 * a share sheet); guest joins with the code; the app searches around the
 * geographic midpoint between the two and both take turns eliminating until
 * one spot remains.
 */
export default function FriendSpin({
  location, travelType, minRating, selectedCuisines, openNowOnly, maxPrice,
  onClose, onShowDetails, onSpotsShown, history, favorites, onToggleFavorite, onOpenMaps,
  tryLater, onToggleTryLater,
  initialJoinCode, onConsumedJoinCode, displayName,
  friends, setFriends,
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, insets);
  const [step, setStep] = useState('menu'); // menu | hosting | joining | playing | done | error
  const [remoteFeedPhotos, setRemoteFeedPhotos] = useState([]);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(null);
  const [code, setCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [session, setSession] = useState(null);
  const [myUid, setMyUid] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  // Which spot's details were last opened, for the map preview's glow - not
  // tied to whether the detail modal (owned by App.js) is still actually
  // open, just "which one am I currently looking at/considering".
  const [selectedSpotId, setSelectedSpotId] = useState(null);
  // How many chat messages have actually been seen - kept in sync with the
  // live count the whole time the schedule modal is open (not just once on
  // open), so nothing looks unread right after closing it. A message that
  // arrives while it's closed leaves this stale, which is exactly what
  // should make the calendar badge light up.
  const [lastSeenChatCount, setLastSeenChatCount] = useState(0);
  const chatCount = session?.chatMessages?.length || 0;
  useEffect(() => {
    if (showScheduleModal) setLastSeenChatCount(chatCount);
  }, [showScheduleModal, chatCount]);
  const hasUnreadChat = chatCount > lastSeenChatCount;
  // People previously played a session with, keyed by their persisted
  // anonymous auth uid (see firebase.js) - lives in App.js now (like every
  // other persisted list) since the journal feature needs the same list too,
  // not just this screen. Incoming pings themselves are watched app-wide
  // from App.js (not scoped to this screen - see its comment for why that
  // first attempt was too narrow), which hands off to this screen via the
  // same initialJoinCode prop a tapped share link already uses.
  // Past finished sessions, so a schedule can be reopened/edited later even
  // after the live "resume on relaunch" pointer is cleared (see the
  // status==='done' effect below) - this is what makes "reschedule" and an
  // "archive" of what's been scheduled possible at all.
  const [archive, setArchive] = useState([]);

  // "Quick Invite" row (menu step, between Friends and Scheduled meals) -
  // search for a specific place/food type + pick a date/time, then tap a
  // friend below to send that exact combination as a one-way invite (user
  // request) - distinct from "Ping", which starts a whole live joint
  // session instead of sharing one already-decided spot+time.
  const [quickQuery, setQuickQuery] = useState('');
  const [quickResults, setQuickResults] = useState([]);
  const [quickSearching, setQuickSearching] = useState(false);
  const [quickSpot, setQuickSpot] = useState(null);
  const [quickDate, setQuickDate] = useState(null);
  const [quickPickerStage, setQuickPickerStage] = useState(null); // null | 'date' | 'time' | 'datetime'
  const [quickDraftDate, setQuickDraftDate] = useState(new Date());
  const [quickSendingUid, setQuickSendingUid] = useState(null);
  const [quickSentUid, setQuickSentUid] = useState(null);
  const quickSearchTimerRef = useRef(null);

  const unsubRef = useRef(null);
  const searchInFlightRef = useRef(false);
  const recordedSpotsKeyRef = useRef(null);
  const recordedArchiveKeyRef = useRef(null);
  const autoJoinAttemptedRef = useRef(false);

  useEffect(() => () => unsubRef.current?.(), []);

  useEffect(() => {
    loadScheduleArchive().then(setArchive);
  }, []);

  // Shared pool (everyone's real searches - see feedPhotos.js), loaded once
  // on mount. Local history below covers the "brand new device, zero network
  // dependency" case immediately; this just adds more once it arrives.
  useEffect(() => {
    fetchFeedPhotos(100).then(setRemoteFeedPhotos);
  }, []);

  // The feed strip's actual content: this device's own spin history first
  // (instant, no network - works from the very first roll) topped up with
  // the shared pool, deduped by place id so a spot already in your own
  // history doesn't show twice just because someone else searched it too.
  // TODO once friends' reviews/photos exist: this is also where a
  // friends-first ordering would need to slot in, rather than lumping
  // everyone's spots into one undifferentiated strip.
  const feedPhotos = useMemo(() => {
    const localPhotos = (history || [])
      .filter((s) => s.photoUrl)
      .map((s) => ({ placeId: s.id, name: s.name, photoUrl: s.photoUrl, cuisine: s.type || '' }));
    const localIds = new Set(localPhotos.map((p) => p.placeId));
    const remotePhotos = remoteFeedPhotos.filter((p) => !localIds.has(p.placeId));
    return [...localPhotos, ...remotePhotos].slice(0, 40);
  }, [history, remoteFeedPhotos]);

  useEffect(() => {
    if (!myUid) ensureSignedIn().then(setMyUid);
  }, []);

  // Updates a friend entry once both players' uid+name are known - dedupes
  // by uid, refreshes the name and moves them to the front on a repeat
  // session. Persistence itself now happens in App.js (like every other
  // list) via its own effect watching `friends`, so this just updates state.
  useEffect(() => {
    if (!session || !myUid || !session.hostUid || !session.guestUid) return;
    const isHost = myUid === session.hostUid;
    const otherUid = isHost ? session.guestUid : session.hostUid;
    const otherName = (isHost ? session.guestName : session.hostName) || '';
    if (!otherUid) return;
    setFriends((prev) => {
      const existing = prev.find((f) => f.uid === otherUid);
      if (existing && existing.name === otherName && prev[0]?.uid === otherUid) return prev;
      return [
        { uid: otherUid, name: otherName || existing?.name || 'Friend', lastPlayedAt: Date.now() },
        ...prev.filter((f) => f.uid !== otherUid),
      ];
    });
  }, [session?.hostUid, session?.guestUid, session?.hostName, session?.guestName, myUid]);

  // Record each bracket into History as soon as it's published, same as a
  // solo flip/elimination. Keyed on the actual set of spot ids (not just "has
  // spots") so a "Hmmm" reroll - a genuinely new bracket in the same session
  // - gets recorded too, without re-recording on every turn's snapshot. Also
  // tags each spot with whichever friend it was spun with (the OTHER
  // player's name, whatever they'd set in Settings > Profile at the time),
  // so History can show who a pick was shared with.
  const spotsKey = session?.spots?.map((s) => s.id).join(',') || null;
  useEffect(() => {
    if (spotsKey && spotsKey !== recordedSpotsKeyRef.current) {
      recordedSpotsKeyRef.current = spotsKey;
      const friendName = myUid === session.hostUid ? session.guestName : session.hostName;
      onSpotsShown?.(session.spots, friendName || null);
    }
  }, [spotsKey]);

  // Auto-join when the user arrived via a tapped share link (see host()'s
  // Share.share call) - waits for GPS lock since joinSession needs a location.
  useEffect(() => {
    if (initialJoinCode && location && step === 'menu' && !autoJoinAttemptedRef.current) {
      autoJoinAttemptedRef.current = true;
      join(initialJoinCode);
      onConsumedJoinCode?.();
    }
  }, [initialJoinCode, location]);

  // Reconnect to a session in progress (user backed out of this screen, or
  // closed the app entirely) instead of always starting at the menu. The
  // Firestore doc is never deleted just by leaving, so remembering the code
  // (plus Firebase Auth's now-persisted uid) is enough to pick back up.
  useEffect(() => {
    (async () => {
      const savedCode = await loadActiveFriendSession();
      if (!savedCode) return;
      try {
        const uid = await ensureSignedIn();
        setCode(savedCode);
        setMyUid(uid);
        subscribe(savedCode);
        setStep('hosting'); // corrected by the status-sync effect below once the snapshot arrives
      } catch (e) {
        clearActiveFriendSession();
      }
    })();
  }, []);

  // Once a session is finished there's nothing left to resume into.
  useEffect(() => {
    if (session?.status === 'done') clearActiveFriendSession();
  }, [session?.status]);

  const subscribe = (c) => {
    unsubRef.current?.();
    unsubRef.current = watchSession(c, (data) => setSession(data));
  };

  // Explicit exit for a session the user actually wants to abandon (friend
  // never joined, stuck turn, etc) - distinct from the header back button,
  // which just closes this screen without touching the session.
  const leaveSession = () => {
    unsubRef.current?.();
    clearActiveFriendSession();
    searchInFlightRef.current = false;
    recordedSpotsKeyRef.current = null;
    setSession(null);
    setCode('');
    setMyUid(null);
    setStep('menu');
  };

  // Host: whenever the session is 'ready' with no spots published yet - the
  // first time the guest joins, or after a "Hmmm" reroll resets it back to
  // this state - run the midpoint search and publish a bracket. Gating on
  // "no spots yet" (rather than a one-shot ref) is what lets this fire again
  // for each reroll instead of just the first round.
  useEffect(() => {
    const hostAndReady =
      session && myUid && session.hostUid === myUid &&
      session.status === 'ready' && session.spots.length === 0 &&
      !searchInFlightRef.current;
    if (!hostAndReady) return;
    searchInFlightRef.current = true;
    (async () => {
      try {
        const mid = midpoint(session.hostLocation, session.guestLocation);
        const gap = milesBetween(session.hostLocation, session.guestLocation);
        // Radius: half the gap plus a 2mi cushion, clamped 2-20mi, so both
        // players are always within reasonable reach of every option.
        const radius = Math.min(20, Math.max(2, gap / 2 + 2));
        const spots = await fetchLocalFood({
          location: mid,
          distance: radius,
          minRating,
          selectedCuisines,
          travelType,
          count: 5,
          openNowOnly,
          maxPrice,
        });
        if (spots.length < 2) {
          setErrorMsg('Not enough spots found between you two. Try widening filters.');
          setStep('error');
          return;
        }
        await startPlaying(code, spots, session.guestUid);
      } finally {
        searchInFlightRef.current = false;
      }
    })();
  }, [session, myUid]);

  useEffect(() => {
    if (session?.status === 'waiting' || session?.status === 'ready') setStep('hosting');
    if (session?.status === 'playing') setStep('playing');
    if (session?.status === 'done') setStep('done');
  }, [session?.status]);

  // Records an archive entry the moment this session first reaches a
  // winner - keyed on `code` so a reroll into a fresh bracket in the same
  // session doesn't create duplicates, and re-finishing the same code (e.g.
  // after reopening from the archive) just no-ops.
  useEffect(() => {
    if (step !== 'done' || !session?.winnerId || !myUid) return;
    if (recordedArchiveKeyRef.current === code) return;
    recordedArchiveKeyRef.current = code;
    const spot = session.spots.find((s) => s.id === session.winnerId);
    if (!spot) return;
    const isHost = myUid === session.hostUid;
    const friendName = (isHost ? session.guestName : session.hostName) || '';
    setArchive((prev) => {
      const updated = [
        { code, myUid, spot, friendName, proposedTime: session.proposedTime || null, createdAt: Date.now() },
        ...prev.filter((a) => a.code !== code),
      ].slice(0, 30); // capped so this doesn't grow forever
      saveScheduleArchive(updated);
      return updated;
    });
  }, [step, session?.winnerId, code, myUid]);

  // Keeps the archived entry's cached proposed time current while it's open,
  // so reopening it later (or seeing it in the archive list) reflects the
  // latest edit rather than whatever it was the moment the game finished.
  useEffect(() => {
    if (step !== 'done' || !code) return;
    setArchive((prev) => {
      const idx = prev.findIndex((a) => a.code === code);
      const nextTime = session?.proposedTime || null;
      if (idx === -1 || prev[idx].proposedTime === nextTime) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], proposedTime: nextTime };
      saveScheduleArchive(updated);
      return updated;
    });
  }, [step, code, session?.proposedTime]);

  // Debounced free-text nearby search for the Quick Invite row - waits for
  // a pause in typing rather than firing one Google request per keystroke.
  // Reuses searchNearbyByKeyword (already built for FoodDetailModal's
  // "find it nearby" - see places.js), not a new API surface.
  useEffect(() => {
    clearTimeout(quickSearchTimerRef.current);
    if (!quickQuery.trim() || !location) {
      setQuickResults([]);
      setQuickSearching(false);
      return;
    }
    setQuickSearching(true);
    quickSearchTimerRef.current = setTimeout(async () => {
      const results = await searchNearbyByKeyword(location, travelType, quickQuery);
      setQuickResults(results);
      setQuickSearching(false);
    }, 450);
    return () => clearTimeout(quickSearchTimerRef.current);
  }, [quickQuery, location, travelType]);

  const openQuickPicker = () => {
    setQuickDraftDate(quickDate || new Date());
    setQuickPickerStage(Platform.OS === 'ios' ? 'datetime' : 'date');
  };

  // Same two-chained-pickers-on-Android/one-shot-on-iOS handling as
  // ScheduleMealModal/InviteFriendModal.
  const handleQuickPickerChange = (event, selected) => {
    const stage = quickPickerStage;
    if (Platform.OS === 'android') setQuickPickerStage(null);
    if (event.type === 'dismissed' || !selected) {
      setQuickPickerStage(null);
      return;
    }
    if (Platform.OS === 'ios') {
      setQuickDate(selected);
      setQuickPickerStage(null);
      return;
    }
    if (stage === 'date') {
      setQuickDraftDate(selected);
      setQuickPickerStage('time');
    } else if (stage === 'time') {
      const combined = new Date(quickDraftDate);
      combined.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setQuickDate(combined);
    }
  };

  // Sends the assembled spot+time to one friend, tapped directly from their
  // row below (only enabled once both are set) - a one-way invite, not a
  // live joint session (see createDirectInvite's own comment for why).
  const sendQuickInvite = async (friend) => {
    if (!quickSpot || !quickDate) return;
    setQuickSendingUid(friend.uid);
    try {
      const { code: c, uid } = await createDirectInvite(location, displayName, quickSpot, quickDate.toISOString());
      await sendPing(friend.uid, uid, displayName, c);
      setQuickSentUid(friend.uid);
      setTimeout(() => {
        setQuickSentUid(null);
        setQuickSpot(null);
        setQuickDate(null);
        setQuickQuery('');
        setQuickResults([]);
      }, 1400);
    } catch (e) {
      setErrorMsg('Could not send the invite. Check your connection.');
    } finally {
      setQuickSendingUid(null);
    }
  };

  const host = async (pingTarget) => {
    try {
      setStep('hosting');
      const { code: c, uid } = await createSession(location, displayName);
      setCode(c);
      setMyUid(uid);
      subscribe(c);
      saveActiveFriendSession(c);
      if (pingTarget) sendPing(pingTarget.uid, uid, displayName, c);
    } catch (e) {
      setErrorMsg('Could not create session. Check your connection.');
      setStep('error');
    }
  };

  // Jumps straight into a past session's winner/schedule screen without
  // going through join() (which refuses already-started sessions by
  // design) - we already know the code and which uid we were.
  const reopenArchived = (entry) => {
    setCode(entry.code);
    setMyUid(entry.myUid);
    subscribe(entry.code);
    setStep('done');
  };

  const join = async (codeOverride) => {
    try {
      const { code: c, uid } = await joinSession((codeOverride || codeInput).trim(), location, displayName);
      setCode(c);
      setMyUid(uid);
      subscribe(c);
      saveActiveFriendSession(c);
      setStep('hosting'); // waiting view works for both until playing
    } catch (e) {
      setErrorMsg(
        e.message === 'NO_SESSION' ? 'No session found with that code.' :
        e.message === 'ALREADY_STARTED' ? 'That session already started.' :
        'Could not join. Check your connection.'
      );
      setStep('error');
    }
  };

  const myTurn = session && session.turnUid === myUid;
  const winner = session?.winnerId
    ? session.spots.find((s) => s.id === session.winnerId)
    : null;

  if (!isFirebaseConfigured) {
    return (
      <View style={styles.screen}>
        <Header onClose={onClose} title="Feast with Friends" />
        <Text style={styles.bodyText}>
          Friend mode needs the Firebase setup finished first (the .env values).
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header onClose={onClose} title="Feast with Friends" />

      {step === 'menu' && (
        <ScrollView contentContainerStyle={styles.centerCol}>
          <Pressable style={styles.bigBtn} onPress={() => host()}>
            <Ionicons name="add-circle" size={22} color={colors.textDark} />
            <Text style={styles.bigBtnText}>Start a session</Text>
          </Pressable>
          <Text style={styles.orText}>— or —</Text>
          <TextInput
            style={styles.codeInput}
            value={codeInput}
            onChangeText={(t) => setCodeInput(t.toUpperCase())}
            placeholder="ENTER CODE"
            placeholderTextColor="#666"
            maxLength={4}
            autoCapitalize="characters"
          />
          <Pressable
            style={[styles.bigBtn, codeInput.length !== 4 && { opacity: 0.4 }]}
            disabled={codeInput.length !== 4}
            onPress={() => join()}
          >
            <Ionicons name="enter" size={22} color={colors.textDark} />
            <Text style={styles.bigBtnText}>Join a friend</Text>
          </Pressable>

          {friends.length > 0 && (
            <View style={styles.friendsSection}>
              <Text style={styles.friendsHeader}>Friends</Text>
              {friends.map((f) => {
                // Quick Invite's "send" icon only lights up once a spot AND
                // a date/time are both assembled below (user request) -
                // otherwise this row behaves exactly as it always has.
                const quickReady = !!quickSpot && !!quickDate;
                const quickBusy = quickSendingUid === f.uid;
                const quickJustSent = quickSentUid === f.uid;
                return (
                  <View key={f.uid} style={styles.friendRow}>
                    <View style={styles.friendAvatar}>
                      <Text style={styles.friendAvatarText}>{(f.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.friendName} numberOfLines={1}>{f.name || 'Friend'}</Text>
                    {quickReady && (
                      <Pressable
                        style={[styles.quickSendBtn, quickJustSent && styles.quickSendBtnSent]}
                        disabled={quickBusy || quickJustSent}
                        onPress={() => sendQuickInvite(f)}
                      >
                        <Ionicons
                          name={quickJustSent ? 'checkmark' : 'send'}
                          size={14}
                          color={colors.textDark}
                        />
                      </Pressable>
                    )}
                    <Pressable style={styles.pingBtn} onPress={() => host(f)}>
                      <Ionicons name="paper-plane-outline" size={14} color={colors.textDark} />
                      <Text style={styles.pingBtnText}>Ping</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* "Quick Invite" - search for a place/food type + pick a date &
              time, then tap the send icon on a friend above to share that
              exact spot+time as a one-way invite (user request: placed
              under Friends, above Scheduled meals). Distinct from Ping,
              which starts a live joint session instead. */}
          <View style={styles.quickInviteSection}>
            <Text style={styles.friendsHeader}>Quick Invite</Text>
            <View style={styles.quickInviteRow}>
              <Pressable style={styles.quickCalendarBtn} onPress={openQuickPicker}>
                <Ionicons name="calendar" size={20} color={quickDate ? colors.textDark : colors.accent} />
              </Pressable>
              <TextInput
                style={styles.quickSearchInput}
                value={quickQuery}
                onChangeText={(t) => { setQuickQuery(t); setQuickSpot(null); }}
                placeholder="Search a place or food type…"
                placeholderTextColor="#777"
              />
            </View>

            {quickDate && (
              <Text style={styles.quickDateText}>
                {quickDate.toLocaleString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </Text>
            )}

            {quickPickerStage && (
              <DateTimePicker
                value={quickDraftDate}
                mode={quickPickerStage === 'time' ? 'time' : quickPickerStage === 'datetime' ? 'datetime' : 'date'}
                display="default"
                onChange={handleQuickPickerChange}
              />
            )}

            {quickSpot ? (
              <View style={styles.quickPickedRow}>
                <Text style={styles.quickPickedText} numberOfLines={1}>✓ {quickSpot.name}</Text>
                <Pressable onPress={() => { setQuickSpot(null); setQuickQuery(''); setQuickResults([]); }}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : (
              <>
                {quickSearching && <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />}
                {quickResults.length > 0 && (
                  <View style={styles.quickResultsList}>
                    {quickResults.map((r) => (
                      <Pressable
                        key={r.id}
                        style={styles.quickResultRow}
                        onPress={() => { setQuickSpot(r); setQuickResults([]); }}
                      >
                        <Text style={styles.quickResultName} numberOfLines={1}>{r.name}</Text>
                        <Text style={styles.quickResultSub} numberOfLines={1}>
                          {joinParts([`⭐ ${r.rating}`, r.distance])}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            {!!quickSpot && !!quickDate && friends.length === 0 && (
              <Text style={styles.quickHint}>Add a friend above to send this to.</Text>
            )}
          </View>

          <Pressable style={styles.archiveLink} onPress={() => setStep('archive')}>
            <Ionicons name="calendar-outline" size={16} color={colors.accent} />
            <Text style={styles.archiveLinkText}>Scheduled meals</Text>
          </Pressable>

          {/* Prototype feed strip: this device's own spin history first
              (instant, works from the very first roll), topped up with
              everyone's real searches (see feedPhotos.js) once that loads.
              Static images only for now - no user posts/reviews yet (see
              feed vision discussion). TODO: once there are enough friends
              connected, this needs a friends-first reformat rather than one
              undifferentiated strip. Caption is place name + cuisine - NOT
              the specific dish in the photo, since Google's Places API
              (legacy or new) doesn't expose per-photo dish identification;
              that'd need either real user-submitted captions (the actual
              future vision) or a review-text-mining heuristic (see the
              "popular dishes" discussion). */}
          {feedPhotos.length > 0 && (
            <View style={styles.feedStripSection}>
              <Text style={styles.friendsHeader}>Feed</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.feedStripRow}>
                {feedPhotos.map((p) => (
                  <View key={p.placeId} style={styles.feedStripCard}>
                    <Pressable onPress={() => setFullscreenPhoto(p.photoUrl)}>
                      <Image source={{ uri: p.photoUrl }} style={styles.feedStripTile} />
                    </Pressable>
                    {/* Sibling of the image's own Pressable, not nested
                        inside it - tapping the name opens the spot's real
                        details view instead of the fullscreen photo (user
                        request). Feed items only ever carry a trimmed
                        shape (placeId/name/photoUrl/cuisine[/rating]), not
                        the full spot record - fetchPlaceDetails inside
                        DetailModal still fills in photos/hours/reviews live
                        off just the id, so this degrades gracefully. */}
                    <Pressable
                      onPress={() => onShowDetails({
                        id: p.placeId,
                        name: p.name,
                        rating: p.rating || 'N/A',
                        type: p.cuisine || '',
                        blurb: '',
                        photoUrl: p.photoUrl,
                        address: '',
                      })}
                    >
                      <Text style={styles.feedStripName} numberOfLines={1}>{p.name}</Text>
                      {!!p.cuisine && (
                        <Text style={styles.feedStripCuisine} numberOfLines={1}>{p.cuisine}</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      )}

      {step === 'archive' && (
        <View style={{ flex: 1, width: '100%' }}>
          <Pressable onPress={() => setStep('menu')} style={styles.archiveBack}>
            <Ionicons name="arrow-back" size={20} color={colors.accent} />
            <Text style={styles.archiveBackText}>Back</Text>
          </Pressable>
          <ScrollView style={{ paddingHorizontal: 20 }}>
            {archive.length === 0 && (
              <Text style={styles.bodyText}>Nothing scheduled yet - finish a spin with a friend to see it here.</Text>
            )}
            {archive.map((entry) => (
              <Pressable key={entry.code} style={styles.card} onPress={() => reopenArchived(entry)}>
                {entry.spot.photoUrl ? (
                  <Image source={{ uri: entry.spot.photoUrl }} style={styles.cardImage} />
                ) : (
                  <View style={styles.cardImagePlaceholder}>
                    <Ionicons name="restaurant" size={20} color={colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{entry.spot.name}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {entry.proposedTime
                      ? new Date(entry.proposedTime).toLocaleString(undefined, {
                          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })
                      : 'No time set yet'}
                    {entry.friendName ? ` • with ${entry.friendName}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {step === 'hosting' && (
        <View style={styles.centerCol}>
          {code ? (
            <>
              <Text style={styles.bodyText}>Share this code with your friend:</Text>
              <Text style={styles.codeDisplay}>{code}</Text>
              <Pressable
                style={styles.shareBtn}
                onPress={() => {
                  const joinLink = ExpoLinking.createURL('join', { queryParams: { code } });
                  Share.share({
                    message: `Let's pick where to eat on Nomnom! Tap to join: ${joinLink}\n(or enter code ${code} manually)`,
                  });
                }}
              >
                <Ionicons name="share-social" size={18} color={colors.textDark} />
                <Text style={styles.bigBtnText}>Share</Text>
              </Pressable>
            </>
          ) : null}
          <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 30 }} />
          <Text style={styles.waitingText}>
            {session?.status === 'ready' ? 'Finding spots between you…' : 'Waiting for your friend to join…'}
          </Text>
          <Pressable onPress={leaveSession} style={{ marginTop: 24, marginBottom: 20, padding: 10 }}>
            <Text style={styles.leaveText}>Leave session</Text>
          </Pressable>
        </View>
      )}

      {step === 'playing' && session && (
        <View style={{ flex: 1, width: '100%' }}>
          <View style={{ paddingHorizontal: 20 }}>
            <FriendMap
              myLocation={myUid === session.hostUid ? session.hostLocation : session.guestLocation}
              myLabel="You"
              friendLocation={myUid === session.hostUid ? session.guestLocation : session.hostLocation}
              friendLabel={(myUid === session.hostUid ? session.guestName : session.hostName) || 'Friend'}
              spots={session.spots}
              eliminatedIds={session.eliminatedIds}
              selectedSpotId={selectedSpotId}
              onSelectSpot={(spot) => { setSelectedSpotId(spot.id); onShowDetails(spot); }}
            />
          </View>
          <Text style={[styles.turnBanner, myTurn ? styles.turnMine : styles.turnTheirs]}>
            {myTurn ? "🟢 Your turn - eliminate one" : "⏳ Their turn…"}
          </Text>
          <ScrollView style={{ paddingHorizontal: 20 }}>
            {/* Renders the full bracket (session.spots never shrinks
                server-side) - eliminated spots stay visible, greyed out and
                struck through, instead of disappearing (same fix as solo
                Elimination mode). Every card stays tappable for details
                regardless of whose turn it is or whether it's already
                eliminated - only the eliminate (X) button is turn-gated. */}
            {session.spots.map((spot) => {
              const isEliminated = session.eliminatedIds.includes(spot.id);
              return (
                <Pressable
                  key={spot.id}
                  style={[styles.card, isEliminated && styles.cardOut, spot.id === selectedSpotId && styles.cardSelected]}
                  onPress={() => { setSelectedSpotId(spot.id); onShowDetails(spot); }}
                >
                  {spot.photoUrl ? (
                    <Image source={{ uri: spot.photoUrl }} style={styles.cardImage} />
                  ) : (
                    <View style={styles.cardImagePlaceholder}>
                      <Ionicons name="restaurant" size={20} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.cardTitle, isEliminated && styles.cardTitleOut]} numberOfLines={1}>
                      {spot.name}
                    </Text>
                    <Text style={styles.cardSub} numberOfLines={1}>{joinParts([`⭐ ${spot.rating}`, spot.type])}</Text>
                    {/* Only set when this slot wasn't a genuine match for the
                        selected cuisine (see places.js's unconfirmedCuisine) -
                        same treatment as solo Elimination mode's bracket. */}
                    {spot.unconfirmedCuisine && (
                      <Text style={styles.cardUnconfirmed} numberOfLines={1}>
                        {spot.unconfirmedCuisine} Spots Nearby
                      </Text>
                    )}
                  </View>
                  {myTurn && !isEliminated && (
                    <Pressable
                      onPress={() => eliminateSpot(code, session, spot.id, myUid)}
                      hitSlop={10}
                      style={styles.eliminateBtn}
                    >
                      <Ionicons name="close" size={20} color={colors.danger} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          {/* marginBottom clears phones' bottom gesture bar/nav buttons - this
              screen is an absolutely-positioned overlay (see `screen` style)
              that sits outside the top-level SafeAreaView's insets entirely
              (that outer SafeAreaView is now restricted to left/right edges
              only anyway - see App.js), so without real insets.bottom this
              sat flush against the very bottom edge on some phones (user
              feedback). The +20 on top is the original deliberate spacing,
              kept as-is. */}
          <Pressable onPress={leaveSession} style={{ alignSelf: 'center', padding: 14, marginBottom: insets.bottom + 20 }}>
            <Text style={styles.leaveText}>Leave session</Text>
          </Pressable>
        </View>
      )}

      {step === 'done' && winner && (
        <>
          <ResultCard
            result={winner}
            gameMode="friend"
            location={myUid === session.hostUid ? session.hostLocation : session.guestLocation}
            isFavorite={favorites.some((f) => f.id === winner.id)}
            onToggleFavorite={() => onToggleFavorite(winner)}
            isTryLater={tryLater.some((t) => t.id === winner.id)}
            onToggleTryLater={() => onToggleTryLater(winner)}
            onOpenMaps={() => onOpenMaps(winner)}
            onShowDetails={() => onShowDetails(winner)}
            onReroll={() => requestNewBracket(code)}
            onOpenSchedule={() => setShowScheduleModal(true)}
            hasUnreadMessage={hasUnreadChat}
            scheduleLocked={
              !!session.hostUid && !!session.guestUid &&
              session.lockedUids?.includes(session.hostUid) &&
              session.lockedUids?.includes(session.guestUid)
            }
          />
          <ScheduleMealModal
            visible={showScheduleModal}
            onClose={() => setShowScheduleModal(false)}
            session={session}
            code={code}
            myUid={myUid}
            spot={winner}
          />
        </>
      )}

      {/* Reopening from the archive sets step to 'done' immediately, before
          the Firestore snapshot for that code has actually arrived - this
          covers that brief gap instead of rendering nothing. */}
      {step === 'done' && !winner && (
        <View style={styles.centerCol}>
          <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 30 }} />
        </View>
      )}

      {step === 'error' && (
        <View style={styles.centerCol}>
          <Ionicons name="cloud-offline" size={40} color={colors.textMuted} />
          <Text style={styles.bodyText}>{errorMsg}</Text>
          <Pressable style={[styles.bigBtn, { marginTop: 16 }]} onPress={() => { setStep('menu'); setErrorMsg(''); }}>
            <Text style={styles.bigBtnText}>Try again</Text>
          </Pressable>
        </View>
      )}

      <FullscreenImageViewer
        visible={fullscreenPhoto !== null}
        photos={fullscreenPhoto ? [fullscreenPhoto] : []}
        onClose={() => setFullscreenPhoto(null)}
      />
    </View>
  );
}

function Header({ onClose, title }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.header}>
      <Pressable onPress={onClose} style={{ padding: 5 }}>
        <Ionicons name="arrow-back" size={28} color={colors.accent} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 28 }} />
    </View>
  );
}

const makeStyles = (colors, insets = { top: 0, bottom: 0, left: 0, right: 0 }) => StyleSheet.create({
  // paddingTop was a flat 60 guess (status-bar clearance, tuned on one
  // physical phone - core RN's SafeAreaView is an iOS-only no-op, so this
  // never got real values on Android). insets.top is the real per-device
  // measurement; +12 is a small deliberate gap above the header row so the
  // back arrow/title don't sit flush against the notch/status bar.
  screen: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.background, zIndex: 90, paddingTop: insets.top + 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 },
  headerTitle: { color: colors.accent, fontSize: 20, fontWeight: 'bold', letterSpacing: 1 },
  centerCol: { flex: 1, alignItems: 'center', paddingHorizontal: 30, paddingTop: 30 },
  bodyText: { color: colors.textLight, fontSize: 16, textAlign: 'center', marginTop: 10 },
  bigBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 13, paddingHorizontal: 26, borderRadius: 30 },
  bigBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  feedStripSection: { width: '100%', marginTop: 26 },
  feedStripRow: { paddingRight: 20 },
  feedStripCard: { width: 148, marginRight: 10 },
  feedStripTile: { width: 148, height: 148, borderRadius: 16, backgroundColor: colors.card },
  feedStripName: { color: colors.textLight, fontSize: 13, fontWeight: '600', marginTop: 6 },
  feedStripCuisine: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  orText: { color: colors.textMuted, marginVertical: 18 },
  codeInput: { color: colors.gold, fontSize: 28, fontWeight: '900', letterSpacing: 10, borderBottomWidth: 2, borderBottomColor: colors.accent, textAlign: 'center', width: 200, marginBottom: 18, padding: 4 },
  codeDisplay: { color: colors.gold, fontSize: 52, fontWeight: '900', letterSpacing: 14, marginVertical: 14 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25 },
  waitingText: { color: colors.textMuted, marginTop: 14, fontStyle: 'italic' },
  leaveText: { color: colors.danger, fontWeight: 'bold', fontSize: 14 },
  friendsSection: { width: '100%', marginTop: 26 },
  friendsHeader: { color: colors.accent, fontSize: 13, fontWeight: 'bold', letterSpacing: 1, marginBottom: 10 },
  friendRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, padding: 10, marginBottom: 8 },
  friendAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  friendAvatarText: { color: colors.textDark, fontWeight: 'bold', fontSize: 14 },
  friendName: { flex: 1, color: colors.textLight, fontSize: 14, fontWeight: '600' },
  pingBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  pingBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 12, marginLeft: 4 },
  // Only rendered once a Quick Invite spot+time are both assembled - sits
  // just left of the existing Ping button, a separate action entirely.
  quickSendBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginRight: 8, ...neonSelected(colors) },
  quickSendBtnSent: { backgroundColor: '#3DBE6C' },
  quickInviteSection: { width: '100%', marginTop: 20, backgroundColor: colors.card, borderRadius: 16, padding: 14 },
  quickInviteRow: { flexDirection: 'row', alignItems: 'center' },
  quickCalendarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', marginRight: 10, ...buttonDepth },
  quickSearchInput: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: colors.textLight, fontSize: 14 },
  quickDateText: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 8 },
  quickPickedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10, marginTop: 10 },
  quickPickedText: { color: colors.textLight, fontSize: 13, fontWeight: '600', flex: 1, marginRight: 8 },
  quickResultsList: { marginTop: 8 },
  quickResultRow: { backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10, marginBottom: 6 },
  quickResultName: { color: colors.textLight, fontSize: 13, fontWeight: '600' },
  quickResultSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  quickHint: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 8 },
  archiveLink: { flexDirection: 'row', alignItems: 'center', marginTop: 24, padding: 10 },
  archiveLinkText: { color: colors.accent, fontWeight: '600', fontSize: 14, marginLeft: 6 },
  archiveBack: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  archiveBackText: { color: colors.accent, fontWeight: '600', fontSize: 15, marginLeft: 6 },
  turnBanner: { textAlign: 'center', fontSize: 16, fontWeight: 'bold', paddingVertical: 10, marginHorizontal: 20, marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  turnMine: { backgroundColor: '#1E3A2A', color: '#7BE495' },
  turnTheirs: { backgroundColor: colors.card, color: colors.textMuted },
  // elevation pinned constant (10) whether selected or not, same fix as
  // every other selected/unselected toggle this session - Android can leave
  // a view stuck blank after its elevation changes between renders.
  // ...buttonDepth adds the shadowColor/shadowOffset/shadowOpacity/shadowRadius
  // set iOS actually needs (elevation alone renders completely flat there) -
  // elevation is re-pinned to 10 after the spread since buttonDepth's own
  // default (4) would otherwise clobber the constant this style depends on.
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, padding: 10, borderRadius: 12, marginBottom: 10, ...buttonDepth, elevation: 10 },
  // Greyed out, not removed - same treatment as solo Elimination mode.
  cardOut: { opacity: 0.45 },
  // Mirrors the map pin's glow when this spot's details were last opened.
  cardSelected: { ...neonSelected(colors) },
  cardTitleOut: { textDecorationLine: 'line-through' },
  cardImage: { width: 46, height: 46, borderRadius: 23, marginRight: 12 },
  cardImagePlaceholder: { width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: '#555', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.textLight, fontSize: 15, fontWeight: 'bold' },
  cardSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  cardUnconfirmed: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 2 },
  eliminateBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.danger,
  },
});
