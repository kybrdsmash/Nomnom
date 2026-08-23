import { doc, setDoc, collection, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

/**
 * Shared pool of food photos for the "Feed" prototype (Feast with Friends
 * page): every real search any device makes upserts its photographed spots
 * here (one doc per place, keyed by placeId, so repeat searches for the same
 * place just refresh the timestamp instead of piling up duplicates). A brand
 * new install with zero friends and zero search history of its own can still
 * open the feed and see something, since this collection is shared across
 * everyone rather than per-device. Static images only for now - no user
 * uploads, no reviews attached yet (see feed vision discussion).
 */
const FEED_CAP = 30; // per-search cap so one big pool fetch doesn't burst 60+ writes

/** Fire-and-forget: upserts up to FEED_CAP spots from a freshly-fetched pool. */
export function recordFeedPhotos(spots) {
  if (!isFirebaseConfigured) return;
  spots
    .filter((s) => s.photoUrl)
    .slice(0, FEED_CAP)
    .forEach((s) => {
      setDoc(doc(db, 'feedPhotos', s.id), {
        placeId: s.id,
        name: s.name,
        photoUrl: s.photoUrl,
        cuisine: s.type || '',
        rating: s.rating,
        updatedAt: serverTimestamp(),
      }).catch(() => {}); // best-effort - a failed write here should never block or surface to the searcher
    });
}

/** Latest `count` shared feed photos, newest-updated first. */
export async function fetchFeedPhotos(count = 100) {
  if (!isFirebaseConfigured) return [];
  const q = query(collection(db, 'feedPhotos'), orderBy('updatedAt', 'desc'), limit(count));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
}
