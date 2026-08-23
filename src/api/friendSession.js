import {
  doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp, arrayUnion,
  collection, addDoc, deleteDoc, query, orderBy, where, getDocs,
} from 'firebase/firestore';
import { db, ensureSignedIn } from './firebase';

/**
 * Friend-spin sessions, stored one Firestore doc per session under
 * sessions/{CODE}. Lifecycle:
 *   waiting  - host created it, waiting for friend to join
 *   ready    - both locations present; host computes spots and writes them
 *   playing  - bracket live; turn-based elimination
 *   done     - one spot left (the winner)
 */

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O to avoid confusion

function makeCode() {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/** Host: creates a session, returns { code, uid }. */
export async function createSession(hostLocation, hostName = '') {
  const uid = await ensureSignedIn();
  const code = makeCode();
  await setDoc(doc(db, 'sessions', code), {
    status: 'waiting',
    createdAt: serverTimestamp(),
    hostUid: uid,
    hostName,
    hostLocation: {
      latitude: hostLocation.latitude,
      longitude: hostLocation.longitude,
    },
    guestUid: null,
    guestName: '',
    guestLocation: null,
    spots: [],
    eliminatedIds: [],
    turnUid: null,
    winnerId: null,
    // Schedule-a-meal step (winner screen): a short-lived chat plus a
    // shared proposed date/time either player can set, confirmed by both
    // tapping "I'm in" before the calendar link is offered.
    chatMessages: [],
    proposedTime: null,
    lockedUids: [],
  });
  return { code, uid };
}

/**
 * Host: creates a "direct invite" - a one-way share of ONE already-picked
 * spot + a proposed time to a specific friend, skipping the live joint
 * elimination bracket entirely (user request: "I already decided, now just
 * invite them" is a lighter-weight ask than "let's spin together right
 * now"). Reuses the exact same sessions/{code} doc shape as a normal
 * bracket session - just pre-filled straight to 'done' with a single spot
 * already the winner - so it can reuse ALL of the same 'done'-step UI
 * (ResultCard, ScheduleMealModal, chat, lock-in, calendar) completely
 * unchanged on both ends. See joinSession below for the matching relaxed
 * join path that lets a recipient attach their uid to one of these.
 */
export async function createDirectInvite(hostLocation, hostName, spot, proposedTimeIso) {
  const uid = await ensureSignedIn();
  const code = makeCode();
  await setDoc(doc(db, 'sessions', code), {
    status: 'done',
    createdAt: serverTimestamp(),
    hostUid: uid,
    hostName,
    hostLocation: {
      latitude: hostLocation.latitude,
      longitude: hostLocation.longitude,
    },
    guestUid: null,
    guestName: '',
    guestLocation: null,
    spots: [spot],
    eliminatedIds: [],
    turnUid: null,
    winnerId: spot.id,
    chatMessages: [],
    proposedTime: proposedTimeIso || null,
    lockedUids: [],
  });
  return { code, uid };
}

/**
 * Guest: joins by code with their location. Throws if the code is bad, or
 * if it's a normal bracket session that's already past the joinable
 * 'waiting' stage. A direct invite (see createDirectInvite above) is
 * created already 'done' with no guestUid yet - joining one of those just
 * attaches the recipient's uid so they can see/chat/lock-in/get the
 * calendar file, WITHOUT flipping its status (there's no bracket to start).
 */
export async function joinSession(code, guestLocation, guestName = '') {
  const uid = await ensureSignedIn();
  const ref = doc(db, 'sessions', code.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('NO_SESSION');
  const data = snap.data();
  const isDirectInvite = data.status === 'done' && !data.guestUid;
  if (data.status !== 'waiting' && !isDirectInvite) throw new Error('ALREADY_STARTED');
  await updateDoc(ref, {
    ...(isDirectInvite ? {} : { status: 'ready' }),
    guestUid: uid,
    guestName,
    guestLocation: {
      latitude: guestLocation.latitude,
      longitude: guestLocation.longitude,
    },
  });
  return { code: code.toUpperCase(), uid };
}

/** Host, once ready: writes the bracket and starts play (guest goes first). */
export async function startPlaying(code, spots, guestUid) {
  await updateDoc(doc(db, 'sessions', code), {
    status: 'playing',
    spots,
    eliminatedIds: [],
    turnUid: guestUid,
  });
}

/** Either player, on their turn: eliminates one spot and passes the turn. */
export async function eliminateSpot(code, session, spotId, myUid) {
  const eliminated = [...session.eliminatedIds, spotId];
  const remaining = session.spots.filter((s) => !eliminated.includes(s.id));
  const otherUid = myUid === session.hostUid ? session.guestUid : session.hostUid;
  const update = { eliminatedIds: eliminated, turnUid: otherUid };
  if (remaining.length === 1) {
    update.status = 'done';
    update.winnerId = remaining[0].id;
  }
  await updateDoc(doc(db, 'sessions', code), update);
}

/**
 * From the winner screen, "Hmmm": fetch a brand new bracket. Flips status
 * back to 'ready' with an empty spots array - the host's existing
 * "search once ready" effect in FriendSpin picks this up and republishes,
 * exactly like the very first round.
 */
export async function requestNewBracket(code) {
  await updateDoc(doc(db, 'sessions', code), {
    status: 'ready',
    spots: [],
    eliminatedIds: [],
    winnerId: null,
  });
}

/** Either player: sends one chat message (used during "schedule a meal"). */
export async function sendChatMessage(code, uid, text) {
  await updateDoc(doc(db, 'sessions', code), {
    chatMessages: arrayUnion({ uid, text, sentAt: Date.now() }),
  });
}

/**
 * Either player: sets/adjusts the shared proposed meal time. Clears both
 * locks whenever the time actually changes, since a change means whatever
 * was previously agreed no longer applies - both people need to re-confirm.
 */
export async function setProposedTime(code, isoString) {
  await updateDoc(doc(db, 'sessions', code), {
    proposedTime: isoString,
    lockedUids: [],
  });
}

/** Either player: toggles their own "I'm in" lock on the current proposed time. */
export async function toggleLockIn(code, session, uid) {
  const locked = session.lockedUids.includes(uid);
  await updateDoc(doc(db, 'sessions', code), {
    lockedUids: locked ? session.lockedUids.filter((id) => id !== uid) : [...session.lockedUids, uid],
  });
}

/** Live subscription to a session doc. Returns the unsubscribe function. */
export function watchSession(code, onChange) {
  return onSnapshot(doc(db, 'sessions', code), (snap) => {
    if (snap.exists()) onChange(snap.data());
  });
}

/**
 * "Ping a friend" - an IN-APP notification only, not a real OS push. Real
 * push notifications need a registered Expo push token via expo-notifications,
 * which needs a custom dev client (native code) - this project deliberately
 * stays on Expo Go (see CoinSpinner.js's Animated-not-Reanimated choice for
 * the same reason), so this only surfaces while the recipient actually has
 * the Friend Spin menu open and subscribed via watchPings below - there's no
 * way to wake their phone from here. Stored as a small subcollection per
 * recipient uid (users/{uid}/pings) rather than a queried top-level
 * collection, so no composite index is needed.
 */
export async function sendPing(toUid, fromUid, fromName, code) {
  // Clear out any earlier ping this same sender left this recipient before
  // adding a new one. Each "Ping" tap starts a brand new session (see host()
  // in FriendSpin.js), so without this, re-pinging someone who hasn't
  // responded yet just stacks another banner on top of the stale one
  // instead of replacing it - confusing on the receiving end (user report:
  // multiple notifications piling up from the same friend). where('fromUid')
  // keeps this scoped to pings from the CURRENT sender only, so it never
  // touches pings from anyone else waiting in the same recipient's inbox.
  const existing = await getDocs(
    query(collection(db, 'users', toUid, 'pings'), where('fromUid', '==', fromUid))
  );
  await Promise.all(existing.docs.map((d) => deleteDoc(d.ref)));
  await addDoc(collection(db, 'users', toUid, 'pings'), {
    fromUid,
    fromName: fromName || '',
    code,
    createdAt: serverTimestamp(),
  });
}

/** Live subscription to a uid's incoming pings, newest first. */
export function watchPings(uid, onChange) {
  const q = query(collection(db, 'users', uid, 'pings'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Clears one ping once it's been acted on (joined) or dismissed. */
export function dismissPing(uid, pingId) {
  return deleteDoc(doc(db, 'users', uid, 'pings', pingId));
}

/** Geographic midpoint between the two players. */
export function midpoint(a, b) {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  };
}

/** Distance in miles between two coords (haversine). */
export function milesBetween(a, b) {
  const R = 3958.8;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
