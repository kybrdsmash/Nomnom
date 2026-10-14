import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ActivityIndicator,
  Image, ScrollView, StyleSheet, Share, Platform, KeyboardAvoidingView, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLinking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { neonSelected, buttonDepth, JOIN_LINK_BASE_URL } from '../constants';
import { BOTTOM_NAV_CLEARANCE } from './BottomNav';
import { joinParts } from '../utils/format';
import {
  createSession, joinSession, startPlaying, eliminateSpot,
  requestNewBracket, watchSession, midpoint, milesBetween,
  sendPing, createDirectInvite, proposeSpot, agreeToProposal,
} from '../api/friendSession';
import { fetchLocalFood, searchNearbyByKeyword } from '../api/places';
import { isFirebaseConfigured, ensureSignedIn } from '../api/firebase';
import {
  loadActiveFriendSession, saveActiveFriendSession, clearActiveFriendSession,
  loadScheduleArchive, saveScheduleArchive,
  loadPinnedFriendUids, savePinnedFriendUids,
} from '../storage';
import { fetchFeedPhotos } from '../api/feedPhotos';
import ResultCard from './ResultCard';
import ScheduleMealModal from './ScheduleMealModal';
import FriendMap from './FriendMap';
import FullscreenImageViewer from './FullscreenImageViewer';

// How many of the grid's slots (after the permanent Invite tile) are the
// customizable "top 5" - everyone else renders plain alphabetical below
// them, inline (see the menu step's friendsSection for the full scheme).
const PINNED_FRIEND_SLOTS = 5;

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

  // The Feast tab's friend grid (menu step) - a 3-column grid with a
  // permanent "Invite" tile first, then up to PINNED_FRIEND_SLOTS
  // customizable friends, then everyone else rendered inline below a "See
  // all friends" divider (no separate screen/search anymore - design
  // review: "the friends can be an infinite scroll coming up from behind
  // see all friends"). Replaces the old constant-height horizontal strip +
  // dedicated All-Friends screen with search/A-Z index.
  //
  // pinnedFriendUids is the explicit, user-chosen order for the top slots -
  // starts empty (pure alphabetical, no customization) and is only ever
  // written to once editing actually happens (see enterEditMode below),
  // never silently inferred from usage.
  const [pinnedFriendUids, setPinnedFriendUidsState] = useState([]);
  const [editingOrder, setEditingOrder] = useState(false);
  const [selectedForSwap, setSelectedForSwap] = useState(null);
  // Collapsed by default now that joining is a secondary link, not its own
  // always-visible button+input - see the menu step's joinLinkRow.
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  useEffect(() => {
    loadPinnedFriendUids().then(setPinnedFriendUidsState);
  }, []);
  const persistPinnedOrder = (next) => {
    setPinnedFriendUidsState(next);
    savePinnedFriendUids(next);
  };

  const sortedFriends = [...friends].sort((a, b) =>
    (a.name || 'Friend').localeCompare(b.name || 'Friend')
  );
  // Explicit pins first (in the user's own chosen order), auto-filled up to
  // PINNED_FRIEND_SLOTS with whoever's next alphabetically - so someone who
  // has never touched ordering still sees a full top-5 grid, just plain A-Z.
  // Dropped pins (a uid saved before a friend was somehow removed - no
  // removal UI exists yet, but defensive regardless) are filtered out
  // rather than left as blank slots.
  const validPinnedUids = pinnedFriendUids.filter((uid) => friends.some((f) => f.uid === uid));
  const autoFillUids = sortedFriends
    .filter((f) => !validPinnedUids.includes(f.uid))
    .slice(0, Math.max(0, PINNED_FRIEND_SLOTS - validPinnedUids.length))
    .map((f) => f.uid);
  const topUids = [...validPinnedUids, ...autoFillUids];
  const topFriends = topUids.map((uid) => friends.find((f) => f.uid === uid)).filter(Boolean);
  const restFriends = sortedFriends.filter((f) => !topUids.includes(f.uid));

  // Locks in whatever's currently showing (explicit pins + autofill) as the
  // real, explicit order the moment editing starts - swapping/promoting
  // below always operates on pinnedFriendUids directly, which would behave
  // unpredictably if autofill kept silently reshuffling mid-edit.
  const enterEditMode = () => {
    if (validPinnedUids.length < Math.min(PINNED_FRIEND_SLOTS, friends.length)) {
      persistPinnedOrder(topUids);
    }
    setEditingOrder(true);
  };
  const exitEditMode = () => {
    setEditingOrder(false);
    setSelectedForSwap(null);
  };

  // Tap one pinned tile to select it (highlighted), tap a second to swap
  // their positions - no drag gesture needed for a 3-column wrapping grid.
  const handlePinnedTilePress = (uid) => {
    if (!selectedForSwap) {
      setSelectedForSwap(uid);
      return;
    }
    if (selectedForSwap === uid) {
      setSelectedForSwap(null);
      return;
    }
    const next = [...pinnedFriendUids];
    const ia = next.indexOf(selectedForSwap);
    const ib = next.indexOf(uid);
    [next[ia], next[ib]] = [next[ib], next[ia]];
    persistPinnedOrder(next);
    setSelectedForSwap(null);
  };

  // Promotes someone from "Everyone else" into the top slots, bumping
  // whoever currently occupies the LAST slot out (design review: "tapping
  // the pin on anyone below swaps them into the top 5, bumping whoever's
  // currently last").
  const promoteFriend = (uid) => {
    const next = [...pinnedFriendUids.slice(0, PINNED_FRIEND_SLOTS - 1), uid];
    persistPinnedOrder(next);
  };

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
      // Was fire-and-forget with no catch of its own - inside an ALREADY-
      // resolved try block by the time this promise settles, so a failure
      // here became an unhandled rejection instead of hitting the catch
      // below, completely invisible (no error to the user, nothing
      // reliably in logs either) - exactly the kind of silent failure that
      // would explain zero real invocations of the onPingCreated Cloud
      // Function despite a real on-device test (user report). The session
      // itself already succeeded at this point (the code above worked), so
      // a ping failure specifically shouldn't blow away that success via
      // setStep('error') - just surface it and let the host still share
      // the code manually if the automatic ping didn't land.
      if (pingTarget) {
        try {
          await sendPing(pingTarget.uid, uid, displayName, c);
        } catch (pingError) {
          // Not setErrorMsg/step - that Text only ever renders on
          // step==='error', which this path deliberately never sets (the
          // session itself is fine). An Alert actually gets seen.
          console.warn('sendPing failed:', pingError);
          Alert.alert(
            'Ping not sent',
            `The session started, but the ping to ${pingTarget.name || 'your friend'} failed to send. Share the code with them another way instead.`
          );
        }
      }
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
    // Same pattern as AtTheTableCompose - the join-code entry and Quick
    // Invite search (both inside step==='menu') had nothing shifting them
    // out from under the keyboard (user report: "multiple times... the
    // dialogue box stays hidden by the keyboard"). behavior=undefined on
    // Android matches every other KeyboardAvoidingView in this codebase -
    // Android's own window resize handles it there, this is an iOS-only fix.
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Header onClose={onClose} title="Feast with Friends" />

      {step === 'menu' && (
        // style (not just contentContainerStyle) is what actually bounds
        // this ScrollView to the remaining space below Header - without it,
        // the ScrollView just grows to hug its own content instead of
        // capping itself and scrolling the overflow, which is exactly why
        // this never scrolled at all (confirmed on-device: a swipe up did
        // nothing, not even partially) and "What Friends Are Eating"'s feed
        // row sat permanently clipped behind BottomNav (user report). The
        // 'archive'/'friends' steps below already wrap their own ScrollView
        // in a flex:1 container for the same reason - this just applies it
        // directly via `style` instead of a separate wrapper View.
        <ScrollView style={{ flex: 1, width: '100%' }} contentContainerStyle={styles.centerCol}>
          {/* Zone label covers everything down through the friends grid
              below - "What Friends Are Eating" is the other zone, around
              the feed strip further down (design review). */}
          <Text style={[styles.friendsHeader, { width: '100%' }]}>Pick Together</Text>

          {/* "Start a session" (standalone button) + a full code-entry block
              replaced by a friends grid as the primary action (design
              review: "start a session should just be a selection of
              friends") - Invite is a permanent first tile (same host() with
              no target the old button used, so this still works for anyone
              not in your friends list yet - it just shares a code same as
              always), then up to PINNED_FRIEND_SLOTS friends, customizable
              via the pencil below. Tapping any friend tile pings them
              directly, same as the old strip's tap action. */}
          <View style={styles.gridWrap}>
            <Pressable style={[styles.gridTile, styles.gridTileInvite]} onPress={() => host()}>
              <View style={[styles.gridAvatar, styles.gridAvatarInvite]}>
                <Ionicons name="person-add" size={17} color={colors.neon} />
              </View>
              <Text style={styles.gridInviteText} numberOfLines={1}>Invite</Text>
            </Pressable>
            {topFriends.map((f) => {
              const selected = selectedForSwap === f.uid;
              // Quick Invite's send action (a pre-picked spot+time, see the
              // section below) used to live on a dedicated friend row - with
              // that row gone, it's a small corner badge instead: tap it
              // specifically to send, tap anywhere else on the tile to ping
              // as normal. Only shown outside edit mode (that already has
              // its own corner icon here - see dragHint below).
              const quickReady = !editingOrder && !!quickSpot && !!quickDate;
              const quickJustSent = quickSentUid === f.uid;
              return (
                <Pressable
                  key={f.uid}
                  style={[styles.gridTile, editingOrder && styles.gridTileEditing, selected && styles.gridTileSelected]}
                  onPress={() => (editingOrder ? handlePinnedTilePress(f.uid) : host(f))}
                >
                  {editingOrder && <Ionicons name="swap-horizontal" size={11} color={colors.textMuted} style={styles.dragHint} />}
                  <View style={styles.gridAvatar}>
                    <Text style={styles.gridAvatarText}>{(f.name || '?')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={styles.gridNameText} numberOfLines={1}>{f.name || 'Friend'}</Text>
                  {quickReady && (
                    <Pressable
                      style={[styles.quickSendBadge, quickJustSent && styles.quickSendBadgeSent]}
                      disabled={quickSendingUid === f.uid || quickJustSent}
                      onPress={() => sendQuickInvite(f)}
                      hitSlop={6}
                    >
                      <Ionicons name={quickJustSent ? 'checkmark' : 'send'} size={10} color={colors.textDark} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </View>

          {editingOrder && (
            <Text style={styles.editHint}>
              Tap two tiles to swap them · tap {'➕'} on anyone below to add them here
            </Text>
          )}

          {/* "See all friends" is a plain divider now, not a destination -
              more friends load in directly below it as part of this same
              scrolling page (design review: "the friends can be an
              infinite scroll coming up from behind see all friends"),
              replacing the old dedicated All-Friends screen with
              search/A-Z index. The pencil (scoped here, not a page-wide
              Edit mode) toggles reordering the grid above. */}
          {friends.length > 0 && (
            <View style={styles.seeAllDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{restFriends.length > 0 ? 'See all friends' : 'Your friends'}</Text>
              <View style={styles.dividerLine} />
              <Pressable
                onPress={() => (editingOrder ? exitEditMode() : enterEditMode())}
                hitSlop={8}
                style={styles.editPencilBtn}
              >
                <Ionicons name={editingOrder ? 'checkmark-circle' : 'pencil'} size={13} color={colors.accent} />
              </Pressable>
            </View>
          )}
          {restFriends.length > 0 && (
            <View style={styles.gridWrap}>
              {restFriends.map((f) => {
                const quickReady = !editingOrder && !!quickSpot && !!quickDate;
                const quickJustSent = quickSentUid === f.uid;
                return (
                  <Pressable
                    key={f.uid}
                    style={styles.gridTile}
                    onPress={() => (editingOrder ? promoteFriend(f.uid) : host(f))}
                  >
                    <View style={styles.gridAvatar}>
                      <Text style={styles.gridAvatarText}>{(f.name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <Text style={styles.gridNameText} numberOfLines={1}>{f.name || 'Friend'}</Text>
                    {editingOrder && (
                      <View style={styles.promoteBadge}>
                        <Ionicons name="add" size={10} color={colors.textDark} />
                      </View>
                    )}
                    {quickReady && (
                      <Pressable
                        style={[styles.quickSendBadge, quickJustSent && styles.quickSendBadgeSent]}
                        disabled={quickSendingUid === f.uid || quickJustSent}
                        onPress={() => sendQuickInvite(f)}
                        hitSlop={6}
                      >
                        <Ionicons name={quickJustSent ? 'checkmark' : 'send'} size={10} color={colors.textDark} />
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* De-emphasized secondary action - joining someone ELSE's
              already-started session is a different, less common action
              than starting/pinging one of your own friends, so this stays
              a small text link rather than competing with the grid above. */}
          <Pressable style={styles.joinLinkRow} onPress={() => setShowCodeEntry((v) => !v)}>
            <Text style={styles.joinLinkText}>Have a code? Join a session</Text>
          </Pressable>
          {showCodeEntry && (
            <View style={styles.codeEntryRow}>
              <TextInput
                style={styles.codeInputSmall}
                value={codeInput}
                onChangeText={(t) => setCodeInput(t.toUpperCase())}
                placeholder="CODE"
                placeholderTextColor="#666"
                maxLength={4}
                autoCapitalize="characters"
              />
              <Pressable
                style={[styles.joinBtnSmall, codeInput.length !== 4 && { opacity: 0.4 }]}
                disabled={codeInput.length !== 4}
                onPress={() => join()}
              >
                <Text style={styles.joinBtnSmallText}>Join</Text>
              </Pressable>
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
              <Text style={styles.friendsHeader}>What Friends Are Eating</Text>
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
            {/* insets.bottom added - BottomNav.js's own position now
                includes it too, so this needs to match or it'd
                under-reserve by exactly that amount on a device with a
                real bottom inset. */}
            <View style={{ height: insets.bottom + BOTTOM_NAV_CLEARANCE }} />
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
                  // A real https link (not ExpoLinking.createURL's
                  // nomnom:// custom scheme) so it's actually tappable in
                  // SMS/WhatsApp/etc - see JOIN_LINK_BASE_URL's own comment.
                  const joinLink = `${JOIN_LINK_BASE_URL}?code=${code}`;
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
          <View style={styles.turnRow}>
            <Text style={[styles.turnBanner, myTurn ? styles.turnMine : styles.turnTheirs, { flex: 1 }]}>
              {myTurn ? "🟢 Your turn - eliminate one" : "⏳ Their turn…"}
            </Text>
            {/* Chat was only reachable from the winner screen before (user
                report: "no way anyone knows chat is available until they're
                already at the calendar") - this carries the same icon
                through the bracket step too, using the SAME modal/state
                (see the ScheduleMealModal render below, moved out of the
                'done' branch). */}
            <Pressable onPress={() => setShowScheduleModal(true)} style={styles.chatIconBtn} hitSlop={8}>
              <Ionicons name="chatbubble-ellipses" size={20} color={colors.accent} />
              {hasUnreadChat && <View style={styles.chatIconDot} />}
            </Pressable>
          </View>
          {/* "Propose a place" (user request: "if they don't want to go
              through all 5... one person proposes 1 of the 5, then the
              other person can either also select it - or cross it off on
              their next turn"). Anyone can propose while it's NOT their
              turn - a free action, doesn't spend a turn - and whoever's
              proposal it isn't resolves it (Agree or the normal ✕) the next
              time their own turn comes around. */}
          {session.proposedId && !session.eliminatedIds.includes(session.proposedId) && (
            <Text style={styles.proposedBanner}>
              {session.proposedByUid === myUid
                ? "You proposed a spot below - waiting on your friend…"
                : "👉 Your friend proposed a spot below"}
            </Text>
          )}
          <ScrollView style={{ paddingHorizontal: 20 }}>
            {/* Renders the full bracket (session.spots never shrinks
                server-side) - eliminated spots stay visible, greyed out and
                struck through, instead of disappearing (same fix as solo
                Elimination mode). Every card stays tappable for details
                regardless of whose turn it is or whether it's already
                eliminated - only the eliminate (X) button is turn-gated. */}
            {session.spots.map((spot) => {
              const isEliminated = session.eliminatedIds.includes(spot.id);
              const isProposed = session.proposedId === spot.id && !isEliminated;
              // Only the player who DIDN'T propose gets to resolve it, and
              // only once it's actually their turn - the proposer can't
              // agree to their own suggestion.
              const canAgree = isProposed && myTurn && session.proposedByUid !== myUid;
              // Proposing is the opposite: only while it's NOT your turn
              // (otherwise you'd just eliminate/keep normally), on a spot
              // that isn't already the live proposal.
              const canPropose = !myTurn && !isEliminated && session.proposedId !== spot.id;
              return (
                <Pressable
                  key={spot.id}
                  style={[styles.card, isEliminated && styles.cardOut, spot.id === selectedSpotId && styles.cardSelected, isProposed && styles.cardProposed]}
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
                        same treatment as solo Elimination mode's bracket,
                        including the softer wording fix (see
                        EliminationList.js's identical fix for the full
                        reasoning - this dense row has no room for the full
                        yes/no prompt ResultCard.js's winner reveal gets). */}
                    {spot.unconfirmedCuisine && (
                      <Text style={styles.cardUnconfirmed} numberOfLines={1}>
                        Not confirmed as {spot.unconfirmedCuisine}
                      </Text>
                    )}
                    {isProposed && <Text style={styles.proposedTag}>👉 Proposed</Text>}
                  </View>
                  {canAgree && (
                    <Pressable
                      onPress={() => agreeToProposal(code, session, spot.id)}
                      hitSlop={10}
                      style={styles.agreeBtn}
                    >
                      <Ionicons name="checkmark" size={20} color={colors.textDark} />
                    </Pressable>
                  )}
                  {canPropose && (
                    <Pressable
                      onPress={() => proposeSpot(code, spot.id, myUid)}
                      hitSlop={10}
                      style={styles.proposeBtn}
                    >
                      <Ionicons name="hand-right-outline" size={18} color={colors.accent} />
                    </Pressable>
                  )}
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
              kept as-is. BOTTOM_NAV_CLEARANCE added on top of that - BottomNav
              now persists over this screen too, and without it this button
              sat directly underneath the floating bar. */}
          <Pressable onPress={leaveSession} style={{ alignSelf: 'center', padding: 14, marginBottom: insets.bottom + 20 + BOTTOM_NAV_CLEARANCE }}>
            <Text style={styles.leaveText}>Leave session</Text>
          </Pressable>
        </View>
      )}

      {step === 'done' && winner && (
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
      )}

      {/* Chat/schedule modal moved OUT of the 'done' branch above - it's now
          reachable from the 'playing' step's own chat icon too (user
          request: "no way anyone knows chat is available until they're
          already at the calendar... need a chat icon that carries through
          the pages"). spot is only real once there's a winner; the modal's
          own calendar-link section already guards on `spot` being present,
          so mid-bracket this just offers chat + a shared proposed time. */}
      <ScheduleMealModal
        visible={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        session={session}
        code={code}
        myUid={myUid}
        spot={winner}
      />

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
    </KeyboardAvoidingView>
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
  // paddingBottom added so BottomNav (now persists over this screen, not
  // just Home) doesn't sit on top of this content's last element.
  centerCol: { flex: 1, alignItems: 'center', paddingHorizontal: 30, paddingTop: 30, paddingBottom: insets.bottom + 30 + BOTTOM_NAV_CLEARANCE },
  bodyText: { color: colors.textLight, fontSize: 16, textAlign: 'center', marginTop: 10 },
  bigBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 13, paddingHorizontal: 26, borderRadius: 30 },
  bigBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  feedStripSection: { width: '100%', marginTop: 26 },
  feedStripRow: { paddingRight: 20 },
  feedStripCard: { width: 148, marginRight: 10 },
  feedStripTile: { width: 148, height: 148, borderRadius: 16, backgroundColor: colors.card },
  feedStripName: { color: colors.textLight, fontSize: 13, fontWeight: '600', marginTop: 6 },
  feedStripCuisine: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  codeDisplay: { color: colors.gold, fontSize: 52, fontWeight: '900', letterSpacing: 14, marginVertical: 14 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25 },
  waitingText: { color: colors.textMuted, marginTop: 14, fontStyle: 'italic' },
  leaveText: { color: colors.danger, fontWeight: 'bold', fontSize: 14 },
  friendsHeader: { color: colors.accent, fontSize: 13, fontWeight: 'bold', letterSpacing: 1, marginBottom: 10 },

  // ---- Friends grid (menu step - Invite tile + top 5 + "everyone else") ----
  gridWrap: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  gridTile: {
    width: '31%', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: colors.card, borderRadius: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  gridTileInvite: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: colors.neon },
  gridTileEditing: { borderColor: colors.cardAlt },
  gridTileSelected: { borderColor: colors.neon, ...neonSelected(colors) },
  gridAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accentDark, alignItems: 'center', justifyContent: 'center' },
  gridAvatarInvite: { backgroundColor: 'transparent', borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.neon },
  gridAvatarText: { color: colors.textDark, fontWeight: 'bold', fontSize: 14 },
  gridNameText: { color: colors.textLight, fontSize: 11, fontWeight: '700', maxWidth: 72 },
  gridInviteText: { color: colors.neon, fontSize: 10.5, fontWeight: '700' },
  dragHint: { position: 'absolute', top: 6, right: 6 },
  editHint: { width: '100%', color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 6, marginBottom: 2 },
  // Small badge in a tile's corner - add-to-top-5 (editing) or send-this-
  // Quick-Invite (not editing), never both at once (see where each renders).
  promoteBadge: {
    position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center',
  },
  quickSendBadge: {
    position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...neonSelected(colors),
  },
  quickSendBadgeSent: { backgroundColor: '#3DBE6C' },
  seeAllDivider: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.cardAlt },
  dividerText: { color: colors.textMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  editPencilBtn: { padding: 2 },
  joinLinkRow: { paddingVertical: 10 },
  joinLinkText: { color: colors.textMuted, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  codeEntryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 6 },
  codeInputSmall: {
    color: colors.gold, fontSize: 18, fontWeight: '900', letterSpacing: 6,
    borderBottomWidth: 2, borderBottomColor: colors.accent, textAlign: 'center', width: 110, padding: 4,
  },
  joinBtnSmall: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 16 },
  joinBtnSmallText: { color: colors.textDark, fontWeight: 'bold', fontSize: 13 },
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
  // Wraps turnBanner + the new chat icon (see FriendSpin's 'playing' step) -
  // turnBanner itself keeps its own marginHorizontal/marginBottom, this row
  // just adds the icon as a fixed-width sibling instead of centering it
  // separately.
  turnRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 20 },
  turnBanner: { textAlign: 'center', fontSize: 16, fontWeight: 'bold', paddingVertical: 10, marginHorizontal: 20, marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  turnMine: { backgroundColor: '#1E3A2A', color: '#7BE495' },
  turnTheirs: { backgroundColor: colors.card, color: colors.textMuted },
  chatIconBtn: { padding: 6, marginBottom: 12 },
  chatIconDot: {
    position: 'absolute', top: 4, right: 4, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: colors.danger, borderWidth: 1.5, borderColor: colors.background,
  },
  proposedBanner: { color: colors.accent, fontSize: 13, fontWeight: '600', textAlign: 'center', marginHorizontal: 20, marginTop: -6, marginBottom: 10 },
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
  // Proposed-spot highlight - a visible border rather than reusing
  // neonSelected's full glow (cardSelected), so a proposed spot that's also
  // the currently-selected one doesn't visually collide with two different
  // "special" treatments at once.
  cardProposed: { borderWidth: 2, borderColor: colors.accent },
  proposedTag: { color: colors.accent, fontSize: 11, fontWeight: '700', marginTop: 2 },
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
  // Agree/propose sit to the LEFT of eliminateBtn (both can render alongside
  // it - see canAgree above, which is deliberately turn-gated the same way
  // eliminateBtn already is) - marginRight spaces them from whichever
  // neighbor follows.
  agreeBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent, marginRight: 8, ...buttonDepth,
  },
  proposeBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.accent,
  },
});
