import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Animated,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  ScrollView,
  Linking,
  useWindowDimensions,
} from 'react-native';
// Core RN's SafeAreaView is a documented iOS-only no-op - it silently does
// nothing on Android, which is why every "clear the status bar/nav bar"
// value in this app used to be a hand-tuned guess instead of a real device
// inset. This context-based version actually measures real insets on both
// platforms.
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import * as ExpoLinking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { COIN_ANIMATION_MS, CUISINES, neonSelected, accentGradient, useVerticalScale } from './src/constants';
import { ThemeProvider, useTheme } from './src/ThemeContext';
import { estimateMaxTimeMinutes } from './src/utils/geo';
import { fetchLocalFood, pickFromFavorites } from './src/api/places';

import CoinSpinner from './src/components/CoinSpinner';
import DaydreamRaccoon from './src/components/DaydreamRaccoon';
import SlidableSegmented from './src/components/SlidableSegmented';
import FilterPanel from './src/components/FilterPanel';
import EliminationList from './src/components/EliminationList';
import BrowseList from './src/components/BrowseList';
import ResultCard from './src/components/ResultCard';
import InviteFriendModal from './src/components/InviteFriendModal';
import HistoryFavoritesOverlay from './src/components/HistoryFavoritesOverlay';
import FabMenu from './src/components/FabMenu';
import SettingsPanel from './src/components/SettingsPanel';
import DetailModal from './src/components/DetailModal';
import FriendSpin from './src/components/FriendSpin';
import RollingFoodStrip from './src/components/RollingFoodStrip';
import CuisineDropdown from './src/components/CuisineDropdown';
import JournalOverlay from './src/components/JournalOverlay';
import FoodDetailModal from './src/components/FoodDetailModal';
import ReportBugModal from './src/components/ReportBugModal';
import HelpModal from './src/components/HelpModal';
import { isFirebaseConfigured, ensureSignedIn } from './src/api/firebase';
import { watchPings, dismissPing } from './src/api/friendSession';
import {
  loadHistory, saveHistory,
  loadFavorites, saveFavorites,
  loadTryLater, saveTryLater,
  loadSeenIds, saveSeenIds,
  loadProfile, saveProfile,
  loadPreferences, savePreferences,
  loadFaveCuisines, saveFaveCuisines,
  loadFriends, saveFriends,
  loadJournal, saveJournal,
  loadTravelType, saveTravelType,
} from './src/storage';
import { pushJournal } from './src/api/journal';
import { uploadJournalPhoto, deleteJournalPhoto } from './src/api/journalPhotos';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Buffer kept between the Cuisines dropdown's bottom edge and the true
// bottom of the screen, so its height calculation never runs flush to the
// physical screen edge even after being capped to fit.
const CUISINE_DROPDOWN_BOTTOM_MARGIN = 40;

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppInner() {
  const { colors } = useTheme();
  const vscale = useVerticalScale();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(colors, vscale, insets);
  const { height: screenHeight } = useWindowDimensions();
  const [result, setResult] = useState(null);
  const [eliminationList, setEliminationList] = useState([]);
  // The full, never-shrinking bracket for the current elimination game -
  // eliminationList itself still shrinks as spots get eliminated (that's
  // what drives "one left = winner" and the visibility of this whole
  // screen), but the UI now shows every spot the whole game, greyed out
  // once eliminated, instead of removing it (user feedback).
  const [originalBracket, setOriginalBracket] = useState([]);
  const [browseList, setBrowseList] = useState([]);
  const [gameMode, setGameMode] = useState('dontcare');

  const [travelType, setTravelType] = useState('drive');
  const [distance, setDistance] = useState(3);
  const [minRating, setMinRating] = useState(4.0);
  const [location, setLocation] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const [showCuisines, setShowCuisines] = useState(false);
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  // 3 saved cuisine-selection presets, shown/edited via the Fave 1/2/3
  // slider at the top of the Cuisines dropdown - see FaveCuisineButton.js.
  // Each slot is { name, cuisines } - name is user-renameable (long-press a
  // slot that's already saved-and-loaded to rename it instead of re-saving).
  const [faveCuisines, setFaveCuisines] = useState([
    { name: 'Fave 1', cuisines: [] },
    { name: 'Fave 2', cuisines: [] },
    { name: 'Fave 3', cuisines: [] },
  ]);

  const [eliminatedStack, setEliminatedStack] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [history, setHistory] = useState([]);
  const [tryLater, setTryLater] = useState([]);
  const [detailSpot, setDetailSpot] = useState(null);
  const [showBugReport, setShowBugReport] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // Which rolling-strip food (long-pressed) is showing its detail view -
  // { image, name } or null when closed. See FoodDetailModal.js.
  const [foodDetailFood, setFoodDetailFood] = useState(null);
  // When a spot's DetailModal was opened from FoodDetailModal's "Find Near
  // Me" list, this holds the food to reopen on close - so the X on that
  // spot goes back to the nearby list, not straight home. Null for every
  // other DetailModal entry point (those close straight to their screen).
  const [detailSpotReturnsTo, setDetailSpotReturnsTo] = useState(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  // People previously played a friend-spin session with, keyed by their
  // persisted anonymous auth uid - lives here (not FriendSpin.js, its
  // original home) since the food journal below needs the same list.
  const [friends, setFriends] = useState([]);
  // Personal food journal - { [placeId]: [entries] }, newest first per
  // place. See src/storage.js's loadJournal/saveJournal and
  // src/api/journal.js for the Firestore mirror friends read from.
  const [journal, setJournal] = useState({});

  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeView, setActiveView] = useState('main'); // 'main' | 'history' | 'favorites'
  const [openNowOnly, setOpenNowOnly] = useState(false);
  // null = any price; otherwise 1-4 matching Google's price_level scale ($-$$$$)
  const [maxPrice, setMaxPrice] = useState(null);
  // Rolls only from the user's own saved Favorites (pickFromFavorites in
  // places.js), no Google API call - user request. Same slot in the ☰ menu
  // as the other quick filters.
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [profile, setProfile] = useState({ displayName: '' });
  const [preferences, setPreferences] = useState({ haptics: true, units: 'mi' });

  // InviteFriendModal - a one-way "here's where/when" share to one friend,
  // distinct from the live joint Feast with Friends session flow. Opened
  // from ResultCard's paper-plane icon (inviteSpot = result) AND from
  // DetailModal's Send button (inviteSpot = whatever spot that sheet is
  // showing, which isn't always the active result - user request).
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteSpot, setInviteSpot] = useState(null);

  // A friend-spin join code arrived via a tapped share link OR a tapped
  // in-app ping (see below), waiting to be consumed once FriendSpin mounts.
  const [pendingJoinCode, setPendingJoinCode] = useState(null);

  // Incoming friend-spin "pings" - in-app only notifications (see sendPing
  // in friendSession.js for why: real OS push needs leaving Expo Go for a
  // custom dev client). Watched app-wide, not just while Friend Spin's menu
  // is open - an earlier version scoped this to that one screen, which
  // meant the recipient had to already be looking at that exact screen for
  // it to ever show up (user feedback: "there was no notification").
  const [myUid, setMyUid] = useState(null);
  const [pings, setPings] = useState([]);
  useEffect(() => {
    if (isFirebaseConfigured && !myUid) ensureSignedIn().then(setMyUid);
  }, []);
  useEffect(() => {
    if (!myUid) return;
    const unsub = watchPings(myUid, setPings);
    return unsub;
  }, [myUid]);
  const joinPing = (ping) => {
    dismissPing(myUid, ping.id);
    setPings((prev) => prev.filter((p) => p.id !== ping.id));
    setPendingJoinCode(ping.code);
    setActiveView('friend');
  };

  // Tracks place IDs shown this session, so repeat results get flagged with a
  // small "seen recently" badge. In-memory for now; will persist with
  // AsyncStorage in the next pass.
  const seenIdsRef = useRef(new Set());

  // History caps out so long-running sessions (lots of flips) don't grow the
  // persisted list forever.
  const MAX_HISTORY = 200;

  // Records every spot the user is actually shown (a flip's result, a full
  // elimination bracket, a friend-spin bracket) so History reflects
  // everything seen, not just spots someone later asked for directions to.
  // Re-showing an already-recorded spot bumps it to the top with a fresh
  // timestamp instead of duplicating it. `friendName`, when given (friend-
  // spin only), tags each entry with who it was spun with, for History's
  // initials token.
  const addToHistory = (spots, friendName = null) => {
    setHistory((prev) => {
      const now = Date.now();
      let next = prev;
      spots.forEach((spot) => {
        next = [{ ...spot, viewedAt: now, friendName: friendName || undefined }, ...next.filter((s) => s.id !== spot.id)];
      });
      return next.slice(0, MAX_HISTORY);
    });
  };

  const coinRef = useRef(null);
  const filtersScrollRef = useRef(null);
  // Measured (not guessed) so the Cuisines dropdown lines up flush under the
  // trigger row with no gap, wherever that trigger actually sits on THIS
  // device - containerRef is the coordinate-space anchor (both measurements
  // are taken relative to it) since the dropdown itself is a sibling of the
  // SafeAreaView's other children, not nested inside the ScrollView its
  // trigger sits inside of. The filter panel never scrolls/shifts to reveal
  // it - the trigger's position is measured wherever it naturally is.
  const containerRef = useRef(null);
  const cuisineTriggerRef = useRef(null);
  const coinWrapperRef = useRef(null);
  const [cuisineDropdownTop, setCuisineDropdownTop] = useState(0);
  const [cuisineDropdownHeight, setCuisineDropdownHeight] = useState(150);
  const fadeOutAnim = useRef(new Animated.Value(1)).current;
  const fadeInAnim = useRef(new Animated.Value(0)).current;

  // Quick bottom-center toast (e.g. "Open Now Only" / "Open Now Only OFF") - shows,
  // holds briefly, fades. Only one at a time; re-triggering restarts it.
  const [toastMessage, setToastMessage] = useState(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef(null);
  const showToast = (message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastAnim.setValue(0);
    Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    toastTimerRef.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
        setToastMessage(null);
      });
    }, 1200);
  };

  // The filter panel stays completely static when the Cuisines dropdown
  // opens - no auto-scroll, nothing above it shifts, the raccoon stays
  // fully visible (user feedback: earlier scroll-to-reveal behavior made
  // the whole panel shift around, which wasn't wanted). Just measure
  // exactly where the trigger currently sits and drop the frosted panel in
  // flush underneath it, sized to reach all the way down past the coin
  // (user feedback: first the middle of the coin was too short, then asked
  // to go further still so the whole cuisine list is visible in as close to
  // one glance/gesture as possible instead of a bunch of small swipes) -
  // measured against the coin's actual position rather than a guessed
  // height, since how much room that is varies by screen size.
  const handleCuisinesExpanded = () => {
    cuisineTriggerRef.current?.measureInWindow((_triggerX, triggerY, _w, triggerHeight) => {
      containerRef.current?.measureInWindow((_containerX, containerY) => {
        // Flush against the trigger's bottom edge - verified correct via a
        // live debug log (triggerY/containerY/triggerHeight math matched
        // the trigger's true screen position exactly). The persistent
        // square-corner bug this comment used to describe was never a
        // positioning issue - it was the ScrollView inside CuisineDropdown
        // not clipping to its rounded bottom corners on Android (see
        // CuisineDropdown's `scroll` style).
        const top = triggerY - containerY + triggerHeight;
        setCuisineDropdownTop(top);
        // Height is capped to whatever actually fits on THIS screen, not
        // just "reach the coin's bottom" unconditionally - on a shorter
        // phone (or a taller coin position), reaching for the coin could
        // ask for more height than the screen has left below the trigger,
        // pushing the last rows of cuisine bubbles off the bottom edge
        // entirely - unreachable, not just visually cut off (user
        // feedback). CUISINE_DROPDOWN_BOTTOM_MARGIN keeps a small buffer
        // above the screen's true bottom edge rather than running flush to it.
        const screenBottomRelative = screenHeight - containerY - CUISINE_DROPDOWN_BOTTOM_MARGIN;
        const maxAvailableHeight = screenBottomRelative - top;
        coinWrapperRef.current?.measureInWindow((_coinX, coinY, _coinW, coinHeight) => {
          const coinBottomRelative = coinY - containerY + coinHeight;
          const desiredHeight = coinBottomRelative - top;
          setCuisineDropdownHeight(Math.max(150, Math.min(desiredHeight, maxAvailableHeight)));
        });
      });
    });
  };

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert('Location access is required to find food near you.');
        return;
      }
      // A cached last-known fix (if any) resolves instantly, so the app can
      // unblock Spin right away instead of sitting on "Locating..." for
      // however long a fresh GPS fix takes (user report: "taking forever to
      // locate"). getCurrentPositionAsync still runs after it and overwrites
      // with the accurate live fix once that's ready.
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) setLocation(lastKnown.coords);
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    })();
  }, []);

  // Warm places.js's pool cache with whatever the filters are the instant we
  // have a GPS fix - fires once, on the location null->value transition
  // right after app open. If the user leaves everything on default and taps
  // "Surprise Me" immediately, that first flip then serves from this
  // already-in-flight (or already-finished) fetch instead of waiting out a
  // fresh Google Places round trip on top of the coin animation (user
  // report: "the first flip on opening takes too long"). Later flips were
  // already fast via this same cache - this just starts the fetch earlier
  // instead of waiting for the button press to kick it off. Deliberately
  // depends on [location] only (not the filter values) - this is meant to
  // fire exactly once for whatever the filters are at that moment, not
  // re-fire on every filter tweak before the user has even searched.
  useEffect(() => {
    if (!location) return;
    fetchLocalFood({
      location, distance, minRating, selectedCuisines, travelType,
      count: 1, openNowOnly, maxPrice, allowRepeats: true, silent: true,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Catch a "join my friend-spin session" link, whether the app was launched
  // fresh by tapping it (getInitialURL) or was already running in the
  // background (the 'url' event). expo-linking's parse() understands both
  // the exp:// form Expo Go uses and the custom "nomnom://" scheme a
  // standalone build would use, so no environment-specific handling here.
  useEffect(() => {
    const handleUrl = (url) => {
      if (!url) return;
      const { path, queryParams } = ExpoLinking.parse(url);
      if (path === 'join' && queryParams?.code) {
        setPendingJoinCode(String(queryParams.code).toUpperCase());
        setActiveView('friend');
      }
    };
    ExpoLinking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  // Load persisted lists once on startup.
  useEffect(() => {
    (async () => {
      const [h, f, t, seen, p, prefs, faves, frnds, jrnl, travel] = await Promise.all([
        loadHistory(), loadFavorites(), loadTryLater(), loadSeenIds(),
        loadProfile(), loadPreferences(), loadFaveCuisines(),
        loadFriends(), loadJournal(), loadTravelType(),
      ]);
      setHistory(h);
      setFavorites(f);
      setTryLater(t);
      seenIdsRef.current = seen;
      setProfile(p);
      setPreferences(prefs);
      setTravelType(travel);
      // Older saves stored each slot as a bare cuisine array ([[], [], []])
      // from before slots had names - normalize those up to the current
      // { name, cuisines } shape rather than crashing on the old data.
      setFaveCuisines((faves || []).map((slot, i) =>
        Array.isArray(slot) ? { name: `Fave ${i + 1}`, cuisines: slot } : slot
      ));
      setFriends(frnds);
      setJournal(jrnl);
      setStorageLoaded(true);
    })();
  }, []);

  // Persist whenever a list changes (skipped until the initial load finishes,
  // so the empty initial state can't overwrite saved data).
  useEffect(() => { if (storageLoaded) saveHistory(history); }, [history, storageLoaded]);
  useEffect(() => { if (storageLoaded) saveFavorites(favorites); }, [favorites, storageLoaded]);
  useEffect(() => { if (storageLoaded) saveTryLater(tryLater); }, [tryLater, storageLoaded]);
  useEffect(() => { if (storageLoaded) saveProfile(profile); }, [profile, storageLoaded]);
  useEffect(() => { if (storageLoaded) savePreferences(preferences); }, [preferences, storageLoaded]);
  useEffect(() => { if (storageLoaded) saveFaveCuisines(faveCuisines); }, [faveCuisines, storageLoaded]);
  useEffect(() => { if (storageLoaded) saveFriends(friends); }, [friends, storageLoaded]);
  useEffect(() => { if (storageLoaded) saveJournal(journal); }, [journal, storageLoaded]);
  useEffect(() => { if (storageLoaded) saveTravelType(travelType); }, [travelType, storageLoaded]);

  // Mirrors the local journal (plus who's allowed to read it) up to
  // Firestore whenever either changes, so mutual friends can see it from
  // their own devices - fire-and-forget, matches storage.js's best-effort
  // philosophy. No-ops entirely without Firebase configured or before this
  // device's own anon uid (myUid, fetched above for the pings feature) is
  // known.
  useEffect(() => {
    if (!storageLoaded || !myUid || !isFirebaseConfigured) return;
    // photoUri is a local file:// path - meaningless (and inaccessible) on a
    // friend's device, so it's stripped before mirroring rather than synced
    // for no reason. sharedPhotoUrl is left as-is: it's only ever present on
    // an entry while photoShared is true (see toggleEntryPhotoShare), so a
    // friend querying this doc directly never sees a photo you've unshared.
    const shareable = Object.fromEntries(
      Object.entries(journal).map(([placeId, entries]) => [
        placeId,
        entries.map(({ photoUri, ...rest }) => rest),
      ])
    );
    pushJournal(myUid, shareable, friends.map((f) => f.uid));
  }, [journal, friends, storageLoaded, myUid]);

  const estimatedMaxTime = React.useMemo(
    () => estimateMaxTimeMinutes(distance, travelType),
    [distance, travelType]
  );

  const startRandomizer = async () => {
    if (!location) {
      alert('Still locking onto your GPS coordinate...');
      return;
    }
    if (favoritesOnly && favorites.length === 0) {
      alert("You haven't saved any favorites yet - heart a spot's details to add one.");
      return;
    }

    setResult(null);
    setEliminationList([]);
    setBrowseList([]);
    setEliminatedStack([]);
    fadeOutAnim.setValue(1);
    fadeInAnim.setValue(0);
    setIsSearching(true);
    coinRef.current?.spin();

    const targetCount = gameMode === 'elimination' ? 5 : gameMode === 'list' ? 12 : 1;

    // Run the API call and a minimum-wait timer in parallel, so a fast network
    // response can never cut the coin animation short. The reveal always waits
    // for whichever takes longer - usually the animation, occasionally the API
    // on a slow connection.
    //
    // try/catch around this specific await, not just relying on fetchLocalFood's
    // own internal error handling - a bug anywhere in that pipeline throwing
    // instead of resolving left isSearching stuck true forever (coin frozen
    // mid-spin, no way back in, user report) since nothing downstream of an
    // unhandled rejection here ever ran. This is a safety net for a FUTURE
    // bug of the same shape, not a fix for the one that already happened
    // (that one's root-caused and fixed in places.js).
    let selectedFoods;
    try {
      [selectedFoods] = await Promise.all([
        favoritesOnly
          ? Promise.resolve(pickFromFavorites({ favorites, location, distance, travelType, count: targetCount }))
          : fetchLocalFood({
              location,
              distance,
              minRating,
              selectedCuisines,
              travelType,
              count: targetCount,
              openNowOnly,
              maxPrice,
              // List mode's "Refresh" should show whatever's left in the pool, not
              // pad out to 12 with repeats the way a flip/bracket pads to its count.
              allowRepeats: gameMode !== 'list',
            }),
        new Promise((resolve) => setTimeout(resolve, COIN_ANIMATION_MS)),
      ]);
    } catch (error) {
      console.error('startRandomizer failed:', error);
      setIsSearching(false);
      coinRef.current?.reset();
      alert('Something went wrong finding a spot. Please try again.');
      return;
    }

    setIsSearching(false);

    if (selectedFoods.length > 0) {
      // Still recorded (seenIdsRef/saveSeenIds) even though nothing surfaces
      // it visually anymore - the "repeat" dot got removed (user feedback:
      // shifted layout around, and repeats are inevitable over a long enough
      // history anyway; the real fix is showing them less often, not
      // flagging every one that slips through). This tracking stays because
      // it's exactly what that real fix would build on.
      const marked = [...selectedFoods];
      marked.forEach((s) => seenIdsRef.current.add(s.id));
      saveSeenIds(seenIdsRef.current);
      addToHistory(marked);

      if (gameMode === 'elimination' && marked.length > 1) {
        setEliminationList(marked);
        setOriginalBracket(marked);
      } else if (gameMode === 'list') {
        setBrowseList(marked);
      } else {
        setResult(marked[0]);
      }

      Animated.parallel([
        Animated.timing(fadeOutAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
        Animated.timing(fadeInAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]).start();
    } else {
      fadeOutAnim.setValue(1);
    }
  };

  const handleEliminate = (idToRemove) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const spotToRemove = eliminationList.find((s) => s.id === idToRemove);
    setEliminatedStack([...eliminatedStack, spotToRemove]);

    const newList = eliminationList.filter((spot) => spot.id !== idToRemove);

    if (newList.length === 1) {
      setEliminationList([]);
      setResult(newList[0]);
    } else {
      setEliminationList(newList);
    }
  };

  const handlePickForMe = () => {
    if (eliminationList.length === 0) return;
    const winner = eliminationList[Math.floor(Math.random() * eliminationList.length)];
    // Keep the not-picked options so "back to list" works from the winner
    // screen even when the dice chose.
    setEliminatedStack((prev) => [
      ...prev,
      ...eliminationList.filter((s) => s.id !== winner.id),
    ]);
    setEliminationList([]);
    setResult(winner);
  };

  // From the winner screen: restore the full original bracket so the user can
  // re-check what they eliminated (and change their mind).
  const handleBackToBracket = () => {
    if (!result) return;
    setEliminationList([...eliminatedStack, result]);
    setEliminatedStack([]);
    setResult(null);
  };

  const handleUndo = () => {
    if (eliminatedStack.length === 0) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const lastEliminated = eliminatedStack[eliminatedStack.length - 1];
    setEliminatedStack(eliminatedStack.slice(0, -1));

    if (result) {
      setEliminationList([result, lastEliminated]);
      setResult(null);
    } else {
      setEliminationList([...eliminationList, lastEliminated]);
    }
  };

  const toggleCuisine = (cuisine) => {
    // No LayoutAnimation here anymore - the bubble grid used to expand/
    // collapse inline in the filter panel, but now lives in its own
    // CuisineDropdown overlay. Configuring a global "animate the next
    // layout change" on every tap was animating the count text's tiny
    // width change ("(3)" -> "(4)"), which cascaded into the whole panel
    // visibly shifting (user feedback: "top panel moves up and down").
    setSelectedCuisines((prev) =>
      prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]
    );
  };

  // All and None are functionally identical (an empty selection and a full
  // one both match every cuisine) - the toast is what actually tells the
  // user that, since otherwise tapping either just looks like it silently
  // did nothing.
  const handleSelectAllCuisines = () => {
    setSelectedCuisines([...CUISINES]);
    showToast('All cuisines selected - no filter applied');
  };
  const handleSelectNoneCuisines = () => {
    setSelectedCuisines([]);
    showToast('No cuisines selected - no filter applied');
  };

  const handleLoadFave = (index) => {
    const slot = faveCuisines[index];
    const saved = slot?.cuisines || [];
    const label = slot?.name || `Fave ${index + 1}`;
    if (saved.length === 0) {
      showToast(`${label} is empty - long-press to save`);
      return;
    }
    setSelectedCuisines(saved);
    showToast(`Loaded ${label}`);
  };
  const handleSaveFave = (index) => {
    const label = faveCuisines[index]?.name || `Fave ${index + 1}`;
    setFaveCuisines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], cuisines: selectedCuisines };
      return next;
    });
    showToast(`${label} Saved`);
  };
  const handleRenameFave = (index, newName) => {
    setFaveCuisines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], name: newName };
      return next;
    });
  };

  const toggleFavorite = (spot) => {
    setFavorites((prev) => {
      const isFav = prev.find((f) => f.id === spot.id);
      return isFav ? prev.filter((f) => f.id !== spot.id) : [spot, ...prev];
    });
  };

  const toggleTryLater = (spot) => {
    setTryLater((prev) => {
      const exists = prev.find((t) => t.id === spot.id);
      return exists ? prev.filter((t) => t.id !== spot.id) : [spot, ...prev];
    });
  };

  // Each visit is its own entry (a spot can be rated more than once over
  // time) - this always prepends a new one, never overwrites. `spot` is a
  // trimmed snapshot (id/name/lat/lng/rating/type/blurb/photoUrl) stored
  // alongside the rating/note so the journal-browser screen can render/
  // reopen it without a fresh Places lookup, same as History/Favorites.
  // `moments` (an ordered [{ text, photoUri }]) is what DetailModal's own
  // compose box now saves via its shared MomentsEditor (user request: same
  // multi-photo/multi-text format as "At the Table") - `note`/`photoUri`
  // stick around only so an entry saved before this change still round-trips
  // through startEdit/renderEntryRow unmodified.
  const addJournalEntry = (placeId, { rating, note, spot, photoUri, moments }) => {
    const now = Date.now();
    const entry = {
      id: Math.random().toString(36).slice(2),
      rating, note, spot, photoUri, moments,
      createdAt: now,
      updatedAt: now,
    };
    setJournal((prev) => ({
      ...prev,
      [placeId]: [entry, ...(prev[placeId] || [])],
    }));
  };

  // "At the Table" (AtTheTableCompose) saves into this SAME journal store,
  // just with `moments` (an ordered [{ text, photoUri }]) instead of a flat
  // note/photoUri - a normal entry made via DetailModal's pencil never has
  // `moments`, so the two shapes coexist without conflict. No `rating` here
  // (deliberately optional/absent) - the point of this flow is a fast note
  // in the moment, not a formal review.
  const addAtTheTableEntry = ({ spot, occasion, moments }) => {
    const now = Date.now();
    const entry = {
      id: Math.random().toString(36).slice(2),
      spot, occasion, moments,
      createdAt: now,
      updatedAt: now,
    };
    setJournal((prev) => ({
      ...prev,
      [spot.id]: [entry, ...(prev[spot.id] || [])],
    }));
  };

  // Lets a late/days-later writeup get fixed up afterward (user request) -
  // mutates that one entry in place by id rather than adding another. `note`/
  // `photoUri` explicitly cleared to undefined on a moments edit (spreading
  // `...e` first would otherwise leave a stale flat note/photo sitting
  // alongside the new moments on an entry that started out in the old shape,
  // see startEdit's own note/photoUri->moments conversion).
  const editJournalEntry = (placeId, entryId, { rating, note, photoUri, moments }) => {
    setJournal((prev) => ({
      ...prev,
      [placeId]: (prev[placeId] || []).map((e) =>
        e.id === entryId
          ? { ...e, rating, note: moments ? undefined : note, photoUri: moments ? undefined : photoUri, moments, updatedAt: Date.now() }
          : e
      ),
    }));
  };

  // Turns friend-visibility for one entry's photo on/off. Off by default and
  // whenever this hasn't been called - the photo only ever leaves the device
  // in response to an explicit tap here. Uploads/deletes the Storage object
  // itself (not just a client-side flag) so unsharing actually revokes
  // access rather than just hiding it in this app's UI - see journalPhotos.js.
  const toggleEntryPhotoShare = async (placeId, entryId) => {
    const entry = (journal[placeId] || []).find((e) => e.id === entryId);
    if (!entry || !entry.photoUri || !myUid) return;
    const sharing = !entry.photoShared;
    const patch = sharing
      ? { photoShared: true, sharedPhotoUrl: await uploadJournalPhoto(myUid, entryId, entry.photoUri) }
      : { photoShared: false, sharedPhotoUrl: null };
    setJournal((prev) => ({
      ...prev,
      [placeId]: (prev[placeId] || []).map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
    }));
    if (!sharing) deleteJournalPhoto(myUid, entryId);
  };

  // For fixing a mis-tap (rated a spot never actually visited) - user
  // request, no confirmation prompt, matching how removing a Try Later spot
  // already works elsewhere in the app rather than introducing a new
  // confirm-dialog pattern. Drops the placeId key entirely once its last
  // entry is gone, rather than leaving an empty array sitting in storage -
  // JournalOverlay's mineRows already filters on entries.length > 0, so
  // this is just tidiness, not something other code depends on.
  const deleteJournalEntry = (placeId, entryId) => {
    setJournal((prev) => {
      const remaining = (prev[placeId] || []).filter((e) => e.id !== entryId);
      if (remaining.length === 0) {
        const { [placeId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [placeId]: remaining };
    });
  };

  const openMaps = (spot) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) Linking.openURL(url);
        else alert("Couldn't open maps on this device.");
      })
      .catch((err) => console.error('An error occurred opening maps', err));
  };

  const resetApp = () => {
    fadeOutAnim.setValue(1);
    fadeInAnim.setValue(0);
    coinRef.current?.reset();
    setResult(null);
    setEliminationList([]);
    setOriginalBracket([]);
    setBrowseList([]);
    setEliminatedStack([]);
  };

  const showFab =
    activeView === 'main' && !isSearching && !result &&
    eliminationList.length === 0 && browseList.length === 0;

  return (
    // edges restricted to left/right only - top/bottom real insets are
    // applied by hand below (homeScreen, pingBanner) and additively inside
    // each full-screen overlay's own useSafeAreaInsets() usage, since each
    // of those wants a different amount of extra breathing room stacked on
    // top of the raw inset, not just the inset alone. Letting this outer
    // SafeAreaView also auto-pad top/bottom would double that padding on
    // top of homeScreen's own.
    <SafeAreaView style={styles.container} edges={['left', 'right']} ref={containerRef}>
      {activeView === 'friend' && (
        <FriendSpin
          location={location}
          travelType={travelType}
          minRating={minRating}
          selectedCuisines={selectedCuisines}
          openNowOnly={openNowOnly}
          maxPrice={maxPrice}
          onClose={() => setActiveView('main')}
          onShowDetails={(spot) => setDetailSpot(spot)}
          onSpotsShown={addToHistory}
          history={history}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          tryLater={tryLater}
          onToggleTryLater={toggleTryLater}
          onOpenMaps={openMaps}
          displayName={profile.displayName}
          initialJoinCode={pendingJoinCode}
          onConsumedJoinCode={() => setPendingJoinCode(null)}
          friends={friends}
          setFriends={setFriends}
        />
      )}

      {activeView !== 'main' && activeView !== 'friend' && activeView !== 'journal' && (
        <HistoryFavoritesOverlay
          activeView={activeView}
          onBack={() => setActiveView('main')}
          history={history}
          favorites={favorites}
          tryLater={tryLater}
          onOpenMaps={openMaps}
          onShowDetails={(spot) => setDetailSpot(spot)}
          onRemoveTryLater={toggleTryLater}
          onAddFavorite={toggleFavorite}
          journal={journal}
          location={location}
        />
      )}

      {activeView === 'journal' && (
        <JournalOverlay
          onBack={() => setActiveView('main')}
          journal={journal}
          friends={friends}
          onShowDetails={(spot) => setDetailSpot(spot)}
          location={location}
          travelType={travelType}
          onSaveAtTheTable={addAtTheTableEntry}
        />
      )}

      <Animated.View
        style={[styles.homeScreen, { opacity: fadeOutAnim }]}
        pointerEvents={
          result || isSearching || eliminationList.length > 0 || browseList.length > 0 || activeView !== 'main'
            ? 'none'
            : 'auto'
        }
      >
        <ScrollView
          ref={filtersScrollRef}
          style={styles.topControlsScroll}
          contentContainerStyle={styles.topControlsContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        >
          <DaydreamRaccoon
            onLongPressFood={(food) => setFoodDetailFood(food)}
            foodDetailOpen={foodDetailFood !== null}
          />
          <FilterPanel
            travelType={travelType}
            setTravelType={setTravelType}
            distance={distance}
            setDistance={setDistance}
            estimatedMaxTime={estimatedMaxTime}
            minRating={minRating}
            setMinRating={setMinRating}
            showCuisines={showCuisines}
            setShowCuisines={setShowCuisines}
            selectedCuisines={selectedCuisines}
            onToggleCuisine={toggleCuisine}
            onCuisinesExpanded={handleCuisinesExpanded}
            cuisineTriggerRef={cuisineTriggerRef}
            units={preferences.units}
          />
        </ScrollView>

        {/* Hidden while the Cuisines dropdown is open - a trial run of
            leaving it visible (relying purely on elevation to stay behind
            the dropdown) brought back a version of the same gap/sliver
            problem, so it goes back to fully unmounting instead of trying
            to out-stack it. Wrapped with a small upward nudge (user
            report: sitting as a plain flex item in this gap read as too
            far down, not actually centered between the Cuisines trigger
            above and the mode toggle below) - RollingFoodStrip itself
            stays layout-agnostic about its neighbors; this is App.js's
            call to make since it's the one that knows what's on either
            side of the gap. */}
        {!showCuisines && (
          <View style={styles.rollingFoodWrap}>
            <RollingFoodStrip onLongPressFood={(food) => setFoodDetailFood(food)} />
          </View>
        )}

        <View style={styles.bottomControls}>
          <SlidableSegmented
            options={[
              { value: 'dontcare', label: 'Surprise Me' },
              { value: 'elimination', label: 'Eliminate' },
              { value: 'list', label: 'Curated' },
            ]}
            value={gameMode}
            onChange={setGameMode}
            styles={{
              segmented: styles.modeToggleContainer,
              segment: styles.modeBtn,
              segmentActive: styles.modeBtnActive,
              segmentText: styles.modeBtnText,
              segmentTextActive: styles.modeBtnTextActive,
            }}
            gradientColors={accentGradient(colors).colors}
          />

          <View ref={coinWrapperRef} collapsable={false}>
            <CoinSpinner
              ref={coinRef}
              isSearching={isSearching}
              onPress={startRandomizer}
              hapticsEnabled={preferences.haptics}
              disabled={!location}
              selectedCuisines={selectedCuisines}
            />
          </View>
          {!location && <Text style={styles.locatingText}>📍 Locating…</Text>}

          {/* Promoted out of the hamburger menu and centered directly under
              the coin - connecting with a friend over food is a core part
              of the app, not a buried settings-menu shortcut (user
              request). */}
          <Pressable style={styles.friendSpinBtn} onPress={() => setActiveView('friend')}>
            {/* Same glossy diagonal gradient as the coin (accentGradient in
                constants.js) - user request, after liking it there. */}
            <LinearGradient {...accentGradient(colors)} style={StyleSheet.absoluteFill} />
            <Ionicons name="people" size={20} color={colors.textDark} />
            <Text style={styles.friendSpinBtnText}>Feast with Friends</Text>
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View
        style={[styles.absoluteCenter, { opacity: fadeInAnim, width: '100%' }]}
        pointerEvents={eliminationList.length > 0 && activeView === 'main' ? 'auto' : 'none'}
      >
        {eliminationList.length > 0 && (
          <EliminationList
            eliminationList={eliminationList}
            fullBracket={originalBracket}
            eliminatedStack={eliminatedStack}
            location={location}
            onEliminate={handleEliminate}
            onUndo={handleUndo}
            onCancel={resetApp}
            onPickForMe={handlePickForMe}
            onShowDetails={(spot) => setDetailSpot(spot)}
          />
        )}
      </Animated.View>

      <Animated.View
        style={[styles.absoluteCenter, { opacity: fadeInAnim, width: '100%' }]}
        pointerEvents={browseList.length > 0 && activeView === 'main' ? 'auto' : 'none'}
      >
        {browseList.length > 0 && (
          <BrowseList
            spots={browseList}
            location={location}
            onRefresh={startRandomizer}
            onCancel={resetApp}
            onShowDetails={(spot) => setDetailSpot(spot)}
          />
        )}
      </Animated.View>

      <Animated.View
        style={[styles.absoluteCenter, { opacity: fadeInAnim }]}
        pointerEvents={result && activeView === 'main' ? 'auto' : 'none'}
      >
        {result && (
          <ResultCard
            result={result}
            gameMode={gameMode}
            location={location}
            isFavorite={favorites.some((f) => f.id === result.id)}
            onToggleFavorite={() => toggleFavorite(result)}
            isTryLater={tryLater.some((t) => t.id === result.id)}
            onToggleTryLater={() => toggleTryLater(result)}
            onOpenMaps={() => openMaps(result)}
            canUndo={eliminatedStack.length > 0}
            onUndo={handleUndo}
            onReset={resetApp}
            onShowDetails={() => setDetailSpot(result)}
            onBackToBracket={handleBackToBracket}
            onOpenInvite={isFirebaseConfigured ? () => { setInviteSpot(result); setShowInviteModal(true); } : undefined}
          />
        )}
      </Animated.View>

      <InviteFriendModal
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        spot={inviteSpot}
        location={location}
        displayName={profile.displayName}
        friends={friends}
      />

      <SettingsPanel
        visible={showFab}
        showSettingsMenu={showSettingsMenu}
        setShowSettingsMenu={setShowSettingsMenu}
        profile={profile}
        setProfile={setProfile}
        preferences={preferences}
        setPreferences={setPreferences}
        myUid={myUid}
        onOpenBugReport={() => setShowBugReport(true)}
        onOpenHelp={() => setShowHelp(true)}
      />

      <ReportBugModal
        visible={showBugReport}
        onClose={() => setShowBugReport(false)}
        myUid={myUid}
        displayName={profile.displayName}
      />

      <HelpModal visible={showHelp} onClose={() => setShowHelp(false)} />

      <FabMenu
        visible={showFab}
        showFabMenu={showFabMenu}
        setShowFabMenu={setShowFabMenu}
        openNowOnly={openNowOnly}
        onToggleOpenNow={() => {
          setOpenNowOnly((prev) => {
            const next = !prev;
            showToast(next ? 'Open Now Only' : 'Open Now Off');
            return next;
          });
        }}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        favoritesOnly={favoritesOnly}
        onToggleFavoritesOnly={() => {
          setFavoritesOnly((prev) => {
            const next = !prev;
            showToast(next ? 'Favorites Only' : 'Favorites Only Off');
            return next;
          });
        }}
        onOpenHistory={() => {
          setActiveView('history');
          setShowFabMenu(false);
        }}
        onOpenFavorites={() => {
          setActiveView('favorites');
          setShowFabMenu(false);
        }}
        onOpenTryLater={() => {
          setActiveView('tryLater');
          setShowFabMenu(false);
        }}
        onOpenJournal={() => {
          setActiveView('journal');
          setShowFabMenu(false);
        }}
      />

      <DetailModal
        spot={detailSpot}
        visible={detailSpot != null}
        onClose={() => {
          setDetailSpot(null);
          if (detailSpotReturnsTo) {
            // Staggered, not simultaneous - each Modal is its own native
            // show/hide transition, and flipping both visible flags in the
            // same tick ran them concurrently (this one sliding out while
            // FoodDetailModal faded in), which read as a glitchy flash (user
            // report). Waiting out this modal's own close animation first
            // keeps the two transitions sequential instead.
            const returnTo = detailSpotReturnsTo;
            setDetailSpotReturnsTo(null);
            setTimeout(() => setFoodDetailFood(returnTo), 300);
          }
        }}
        isFavorite={detailSpot ? favorites.some((f) => f.id === detailSpot.id) : false}
        onToggleFavorite={() => detailSpot && toggleFavorite(detailSpot)}
        isTryLater={detailSpot ? tryLater.some((t) => t.id === detailSpot.id) : false}
        onToggleTryLater={() => detailSpot && toggleTryLater(detailSpot)}
        onOpenDirections={() => detailSpot && openMaps(detailSpot)}
        onOpenInvite={isFirebaseConfigured ? () => { setInviteSpot(detailSpot); setShowInviteModal(true); } : undefined}
        journal={journal}
        onAddJournalEntry={addJournalEntry}
        onEditJournalEntry={editJournalEntry}
        onDeleteJournalEntry={deleteJournalEntry}
        onToggleEntryPhotoShare={toggleEntryPhotoShare}
        friends={friends}
      />

      <FoodDetailModal
        visible={foodDetailFood !== null}
        food={foodDetailFood}
        location={location}
        travelType={travelType}
        onClose={() => {
          setFoodDetailFood(null);
          setDetailSpotReturnsTo(null);
        }}
        onShowSpotDetails={(spot) => {
          // Staggered for the same reason as DetailModal's onClose above -
          // let this modal's own close animation finish before the next one
          // starts its own open animation.
          setDetailSpotReturnsTo(foodDetailFood);
          setFoodDetailFood(null);
          setTimeout(() => setDetailSpot(spot), 300);
        }}
      />

      <CuisineDropdown
        visible={showCuisines && activeView === 'main'}
        top={cuisineDropdownTop}
        scrollHeight={cuisineDropdownHeight}
        selectedCuisines={selectedCuisines}
        onToggleCuisine={toggleCuisine}
        faveCuisines={faveCuisines}
        onLoadFave={handleLoadFave}
        onSaveFave={handleSaveFave}
        onRenameFave={handleRenameFave}
        onSelectAll={handleSelectAllCuisines}
        onSelectNone={handleSelectNoneCuisines}
        location={location}
        travelType={travelType}
        onShowSpotDetails={(spot) => setDetailSpot(spot)}
      />

      {toastMessage && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              opacity: toastAnim,
              // A touch of scale on top of the fade, so it reads as a small
              // pop-in rather than a flat fade - settles to full size right
              // as it's fully opaque, then just evaporates (fades) on the
              // way out (user request).
              transform: [{ scale: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            },
          ]}
        >
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}

      {/* Incoming friend-spin pings, shown regardless of which screen is open
          (not just Friend Spin's own menu) - hidden while already inside
          Friend Spin since that screen has its own context for a session. */}
      {pings.length > 0 && activeView !== 'friend' && (
        <View style={styles.pingBanner}>
          {pings.map((ping) => (
            <View key={ping.id} style={styles.pingRow}>
              <Ionicons name="notifications" size={18} color={colors.gold} />
              <Text style={styles.pingText} numberOfLines={1}>
                {ping.fromName || 'A friend'} wants to spin!
              </Text>
              <Pressable style={styles.pingJoinBtn} onPress={() => joinPing(ping)}>
                <Text style={styles.pingJoinText}>Join</Text>
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={() => {
                  dismissPing(myUid, ping.id);
                  setPings((prev) => prev.filter((p) => p.id !== ping.id));
                }}
              >
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors, vscale = 1, insets = { top: 0, bottom: 0, left: 0, right: 0 }) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // paddingBottom trimmed from 100 - topControlsScroll below is flex:1 with
  // scrolling deliberately disabled (the filter panel must stay static), so
  // ANY growth in bottomControls' own height (like the Friend Spin button
  // added below the coin) directly shrinks topControlsScroll's allotted
  // space with nowhere for the overflow to go - its bottom-most content
  // (the Cuisines trigger) was getting clipped off entirely (user feedback:
  // "cuisines bar is totally missing"). Reclaiming that space here since
  // this padding was just bottom-of-screen buffer, not load-bearing.
  // Both paddings now also scale down on shorter screens via `vscale` (see
  // useVerticalScale in constants.js) instead of staying fixed pixel values -
  // a Galaxy S20 report that the Cuisines trigger was still cut off/
  // inaccessible despite the elevation-based paint-order fixes
  // (RollingFoodStrip.js's collapsable, this file's topControlsScroll
  // elevation) showed this needed to be actual content overflow on a
  // shorter usable screen height, not just paint order - and hand-tuning a
  // fixed constant per device report doesn't scale to "many phones
  // eventually" (user request), so this now adapts to whatever device it's
  // actually running on instead.
  // paddingTop used to be a flat 60 (22 guessed status-bar clearance + 38 of
  // deliberate push-down - see below), which is why it was flagged as a
  // notch-clearance guess tuned on one physical phone (a documented core-RN
  // SafeAreaView no-op on Android at the time). insets.top is now the real
  // per-device measurement for that first part; the +38 push-down (matching
  // the ~38dp/cm conversion used elsewhere in this app - see ResultCard.js's
  // map padding history, to push the raccoon-through-Cuisines block down
  // ~1cm per user request) is still multiplied by vscale like the rest of
  // this padding, so on a short screen that deliberate push-down still
  // shrinks proportionally right along with everything else, while the real
  // inset itself is left unscaled since it's already an accurate per-device
  // value, not a guess that needs shrinking.
  // paddingBottom similarly adds insets.bottom (home-indicator/gesture-bar
  // clearance) on top of the original 70*vscale bottom-of-screen buffer -
  // see the paddingBottom history above this style used to have, now
  // reclaimed as pure spacing rather than notch/gesture-bar clearance.
  homeScreen: {
    flex: 1, justifyContent: 'space-between',
    paddingTop: insets.top + 38 * vscale,
    paddingBottom: insets.bottom + 70 * vscale,
  },
  // Same ~38dp/cm conversion this file already uses elsewhere (see
  // paddingTop's history above) - pulls the strip up out of the exact
  // center of its flex gap, closer to the Cuisines trigger above it, per
  // user feedback that centered-by-flex still read as sitting too low.
  rollingFoodWrap: { marginTop: -38 * vscale },
  // elevation here (not just document order) is what makes this reliably
  // paint above RollingFoodStrip on Android - same reasoning as
  // CuisineDropdown's wrapper: RollingFoodStrip's native-driven icon
  // animations can get promoted onto their own GPU compositing layer, which
  // doesn't always respect normal document order, and a recent margin
  // reduction (reclaiming space for the Friend Spin button) brought the
  // Cuisines trigger physically closer to the strip, making a rolling icon
  // visually bleed into the closed trigger bar when it passed nearby (user
  // feedback). Originally just 5 ("only needs to beat RollingFoodStrip's own
  // promoted layer") - bumped to 15 after a Galaxy S20 report that 5 wasn't
  // enough margin there and the Cuisines trigger was fully hidden behind the
  // strip, not just occasionally grazed - Android's elevation/GPU-layer
  // compositing behavior varies enough across manufacturers/drivers that a
  // margin tuned on one device isn't guaranteed to hold on another. Still
  // comfortably under bottomControls' 25 and the Cuisines dropdown's own 60.
  topControlsScroll: { flex: 1, width: '100%', zIndex: 15, elevation: 15 },
  topControlsContent: { alignItems: 'center', paddingBottom: 20 },
  // elevation here (not the coin's own internal one) is what actually
  // decides whether the coin paints over the Cuisines/ratings section above
  // it. Android's elevation only reorders paint order among DIRECT siblings
  // under the same parent - CoinSpinner's own wrapper elevation only settles
  // ordering among things nested inside bottomControls, it has no effect on
  // how bottomControls itself stacks against topControlsScroll (its actual
  // sibling under homeScreen). Without this, when the coin's toss animation
  // translates it up out of bottomControls' own bounds and over the filter
  // section, topControlsScroll's elevation (5) wins regardless of what's
  // elevated deep inside bottomControls (user report: coin still flipping
  // behind Cuisines/ratings). Comfortably above topControlsScroll's 5.
  bottomControls: { alignItems: 'center', zIndex: 25, elevation: 25 },
  // marginTop widened (10->20) for more breathing room from the coin above
  // it (user request) - offset by trimming FilterPanel's own section
  // margins by the same rough amount, since bottomControls sits in a
  // fixed-height flex layout where any growth here shrinks the (non-
  // scrolling) filter panel's allotted space above.
  friendSpinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 20,
    marginTop: 20, overflow: 'hidden', ...neonSelected(colors),
  },
  friendSpinBtnText: { color: colors.textDark, fontWeight: 'bold', fontSize: 14, marginLeft: 8 },
  absoluteCenter: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  // marginBottom widened (16->24) to nudge the coin (and everything below
  // it) down a bit, same request/trade-off as friendSpinBtn's marginTop above.
  modeToggleContainer: { flexDirection: 'row', backgroundColor: '#333', borderRadius: 30, padding: 4, marginBottom: 24, width: '85%', overflow: 'hidden' },
  // marginHorizontal gives the active segment's neon glow room to breathe -
  // Android's `elevation` shadow can bleed sideways onto a flush-adjacent
  // sibling, visually painting over the inactive segment's text (looked
  // like it "disappeared" - user feedback).
  // Explicit backgroundColor (not transparent) - Android's `elevation` (from
  // the active segment's neon glow) needs an opaque surface on ITS sibling
  // too, or the inactive segments can render wrong/invisible next to a
  // promoted elevated layer (same root cause as the travel toggle's square-
  // corner bug - user feedback on both).
  // elevation is constant (10, matching neonSelected's) whether active or
  // not - Android silently makes a view vanish after its `elevation` value
  // changes between renders (a real bug, not the shadow-bleed one described
  // above): this segment used to have NO elevation at all until it became
  // active, jumping 0 -> 10, which is exactly the pattern that triggers it.
  // Only backgroundColor/border/shadowColor now differ between states.
  // borderWidth is pinned at 2 here (transparent at rest) rather than only
  // appearing on the active state - these are flex:1 siblings in a row, and
  // a 0->2px border jump on select was enough to nudge the whole row's
  // layout, visibly shifting the neighboring bubble (user feedback). Same
  // "pin the property that changes, vary only color" fix as the elevation
  // lesson elsewhere in this file - only borderColor changes now, so
  // nothing ever resizes.
  modeBtn: { flex: 1, marginHorizontal: 2, paddingVertical: 12, alignItems: 'center', borderRadius: 26, backgroundColor: '#333', overflow: 'hidden', elevation: 10, borderWidth: 2, borderColor: 'transparent' },
  modeBtnActive: { backgroundColor: colors.accent, ...neonSelected(colors) },
  modeBtnText: { color: colors.textLight, fontWeight: 'bold', fontSize: 16 },
  modeBtnTextActive: { color: colors.textDark },
  locatingText: { color: colors.textMuted, marginTop: 10, fontSize: 13, fontStyle: 'italic' },
  toast: {
    position: 'absolute', bottom: 110, alignSelf: 'center', zIndex: 200,
    backgroundColor: colors.card, paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 20, elevation: 8,
  },
  toastText: { color: colors.textLight, fontWeight: 'bold', fontSize: 14 },
  // top was a flat 60 guess (this banner is absolutely positioned, so the
  // outer SafeAreaView's own padding - restricted to left/right anyway,
  // see the return statement's comment - never reached it). insets.top is
  // the real clearance now; +8 is just a small breathing-room gap below
  // the status bar/notch, not a deliberate design push like homeScreen's.
  pingBanner: {
    position: 'absolute', top: insets.top + 8, left: 16, right: 16, zIndex: 210,
  },
  pingRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card,
    borderRadius: 16, padding: 12, marginBottom: 8, elevation: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  pingText: { flex: 1, color: colors.textLight, fontSize: 13, marginLeft: 8, marginRight: 8, fontWeight: '600' },
  pingJoinBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 12, marginRight: 8 },
  pingJoinText: { color: colors.textDark, fontWeight: 'bold', fontSize: 12 },
});
