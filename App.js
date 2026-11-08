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
import * as Application from 'expo-application';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { COIN_ANIMATION_MS, CUISINES, DEFAULT_FAVE_NAMES, DEFAULT_FRIEND_UID, DEFAULT_FRIEND_NAME, useVerticalScale, buttonDepth } from './src/constants';
import { ThemeProvider, useTheme } from './src/ThemeContext';
import { estimateMaxTimeMinutes } from './src/utils/geo';
import { fetchLocalFood, pickFromFavorites } from './src/api/places';

import CoinSpinner from './src/components/CoinSpinner';
import DaydreamRaccoon from './src/components/DaydreamRaccoon';
import FilterPanel from './src/components/FilterPanel';
import EliminationList from './src/components/EliminationList';
import BrowseList from './src/components/BrowseList';
import ResultCard from './src/components/ResultCard';
import InviteFriendModal from './src/components/InviteFriendModal';
import HistoryFavoritesOverlay from './src/components/HistoryFavoritesOverlay';
import QuickFilters from './src/components/QuickFilters';
import GameModeIcons from './src/components/GameModeIcons';
import BottomNav, { BOTTOM_NAV_CLEARANCE } from './src/components/BottomNav';
import MyPlacesHub from './src/components/MyPlacesHub';
import SettingsPanel from './src/components/SettingsPanel';
import DetailModal from './src/components/DetailModal';
import FriendSpin from './src/components/FriendSpin';
import RollingFoodStrip from './src/components/RollingFoodStrip';
import CuisineDropdown from './src/components/CuisineDropdown';
import JournalOverlay from './src/components/JournalOverlay';
import FoodDetailModal from './src/components/FoodDetailModal';
import ReportBugModal from './src/components/ReportBugModal';
import HelpModal from './src/components/HelpModal';
import OnboardingOverlay from './src/components/OnboardingOverlay';
import BuddyPicker from './src/components/BuddyPicker';
import MapsLeaveWarningModal from './src/components/MapsLeaveWarningModal';
import { isFirebaseConfigured, ensureSignedIn, auth } from './src/api/firebase';
import { recordSpin, recordWarmCalls } from './src/api/analytics';
import { onAuthStateChanged } from 'firebase/auth';
import { pushSavedLists, fetchSavedLists, mergeById, mergeFaveCuisines } from './src/api/savedLists';
import { watchPings, dismissPing } from './src/api/friendSession';
import { registerForPushNotifications, addNotificationTapListener } from './src/api/push';
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
  loadOnboardingSeen, saveOnboardingSeen,
  loadDefaultFriendSeeded, saveDefaultFriendSeeded,
  loadBuddyAvatar, saveBuddyAvatar,
  loadInstallReferrerChecked, saveInstallReferrerChecked,
  loadNavTapCounts, saveNavTapCounts,
} from './src/storage';
import { pushJournal, fetchMyJournal, mergeJournal } from './src/api/journal';
import { buildFakeJournal, stripFakeEntries, countFakeEntries, isFakeEntry } from './src/dev/fakeJournal';
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
  // Defaults true (not false) so the overlay's "show while !onboardingSeen"
  // condition can never flash visible before storage has actually loaded -
  // it only ever gets set false below once loadOnboardingSeen() genuinely
  // confirms a brand new install hasn't seen it yet.
  const [onboardingSeen, setOnboardingSeen] = useState(true);
  // Same "default true so it can't flash visible before storage loads"
  // reasoning as onboardingSeen just above - null here specifically means
  // "no buddy chosen yet," so this starts as a non-null placeholder
  // ('') rather than null, until loadBuddyAvatar() confirms the real
  // (possibly still-null, brand-new-install) value.
  const [buddyAvatar, setBuddyAvatar] = useState('');
  // Reopening the picker from Settings > Profile ("Change your buddy") is a
  // separate flag from "never picked one yet" (!buddyAvatar) below, since
  // only the manual-reopen case should be dismissible without picking.
  const [showBuddyPickerManual, setShowBuddyPickerManual] = useState(false);
  const [distance, setDistance] = useState(3);
  const [minRating, setMinRating] = useState(4.0);
  const [location, setLocation] = useState(null);
  // When/where the current `location` fix was actually taken, for Settings'
  // Location row (user request: "date and time on when it was last pulled
  // and the actual rough location"). `label` fills in a moment later from
  // the device's own reverse geocoder (free - no Google API call).
  const [locationMeta, setLocationMeta] = useState({ at: null, label: null, refreshing: false });
  const [isSearching, setIsSearching] = useState(false);

  const [showCuisines, setShowCuisines] = useState(false);
  const [selectedCuisines, setSelectedCuisines] = useState([]);
  // 3 saved cuisine-selection presets, shown/edited via the Fave 1/2/3
  // slider next to the collapsed Cuisines trigger - see FaveCuisineButton.js.
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
  // Anonymous, local-only tap counts per BottomNav destination (see
  // src/storage.js's loadNavTapCounts) - user request, to have real data on
  // whether the bottom nav's current layout (5 slots: Home/Places/Feast/
  // Favorites/Settings) actually matches how it gets used, rather than
  // guessing from general UX convention alone.
  const [navTapCounts, setNavTapCounts] = useState({});
  // People previously played a friend-spin session with, keyed by their
  // persisted anonymous auth uid - lives here (not FriendSpin.js, its
  // original home) since the food journal below needs the same list.
  const [friends, setFriends] = useState([]);
  // Personal food journal - { [placeId]: [entries] }, newest first per
  // place. See src/storage.js's loadJournal/saveJournal and
  // src/api/journal.js for the Firestore mirror friends read from.
  const [journal, setJournal] = useState({});

  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [activeView, setActiveView] = useState('main');
  // 'main' | 'friend' | 'places' are the only reachable values today (via
  // BottomNav). 'favorites' | 'tryLater' | 'journal' are dead - nothing
  // sets them anymore since MyPlacesHub ('places') consolidated all of it,
  // but HistoryFavoritesOverlay.js/JournalOverlay.js still handle them
  // correctly if something ever does again.
  //
  // Which of MyPlacesHub's own internal tabs to land on - lifted up here
  // (not local state inside MyPlacesHub) so BottomNav's Journal icon can
  // force it to 'journal' every time, and so activeNavTab (above) can read
  // it back to highlight the right icon.
  const [placesTab, setPlacesTab] = useState('favorites');
  const [openNowOnly, setOpenNowOnly] = useState(false);
  // null = any price; otherwise 1-4 matching Google's price_level scale ($-$$$$)
  const [maxPrice, setMaxPrice] = useState(null);
  // Rolls only from the user's own saved Favorites (pickFromFavorites in
  // places.js), no Google API call - user request. Same slot in the ☰ menu
  // as the other quick filters.
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // "Really Freaking Good" (user request) - a much stricter quality bar than
  // the normal minRating slider (see places.js's filterReallyGood), and
  // auto-broadens the search radius since the whole premise is being willing
  // to go further for something exceptional.
  const [reallyGoodOnly, setReallyGoodOnly] = useState(false);

  const [profile, setProfile] = useState({ displayName: '' });
  // mapsWarning defaults true (warn before leaving the app for Maps) - see
  // openMaps below for why this was added.
  const [preferences, setPreferences] = useState({ haptics: true, units: 'mi', mapsWarning: true });

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
  // Was a one-shot ensureSignedIn().then(setMyUid) - myUid then never
  // changed again for the rest of the session. That's wrong the moment
  // Google sign-in switches accounts: linking usually upgrades the SAME
  // anonymous uid in place, but signInWithGoogleIdToken's own fallback
  // (this exact Google account was already linked on a DIFFERENT device
  // first) calls signInWithCredential instead, which swaps in that OTHER,
  // pre-existing uid entirely - exactly the cross-device restore case this
  // feature is FOR. Listening to onAuthStateChanged instead means myUid
  // (and everything keyed off it - pings, the sync effects below) always
  // reflects whichever account is actually signed in right now.
  //
  // ensureSignedIn() moved IN here (was its own separate effect calling it
  // unconditionally on mount) - firebase.js's getReactNativePersistence
  // restores a previously signed-in session from AsyncStorage
  // ASYNCHRONOUSLY, so auth.currentUser reads null for a brief window on
  // EVERY cold start even when a real (Google-linked) session WAS
  // persisted. The old code's ensureSignedIn() call raced that restore:
  // it ran immediately on mount, saw auth.currentUser as still null, and
  // minted a brand new anonymous session before the real persisted one
  // ever got a chance to load - silently discarding it (user report:
  // "when I close the app, it logs me out"). onAuthStateChanged's first
  // callback is guaranteed to fire only once persistence has actually
  // resolved, so checking `user` HERE is the real way to tell "genuinely
  // signed out" apart from "still loading" - this also doubles as what
  // actually fulfills signOutGoogle's own documented behavior ("signing
  // out returns to a fresh anonymous session"), which nothing else was
  // reliably re-triggering before.
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(auth, (user) => {
      setMyUid(user?.uid || null);
      if (!user) ensureSignedIn();
    });
  }, []);
  useEffect(() => {
    if (!myUid) return;
    const unsub = watchPings(myUid, setPings);
    return unsub;
  }, [myUid]);
  // Registers this device's Expo push token so a friend's ping can wake the
  // phone even when the app isn't open (see src/api/push.js) - the in-app
  // pings list above only ever helped while already looking at the app.
  useEffect(() => {
    if (myUid) registerForPushNotifications(myUid);
  }, [myUid]);
  // Tapping a push notification (app backgrounded or killed) should join
  // the session exactly like tapping a shared nomnom:// link already does.
  useEffect(() => {
    return addNotificationTapListener((code) => {
      setPendingJoinCode(code);
      setActiveView('friend');
    });
  }, []);
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
  // QuickFilters' 3-toggle stack was pinned to a hand-picked `bottom: 170` -
  // close enough to the coin's own vertical center on the device it was
  // tuned against, but the coin's real Y position comes out of homeScreen's
  // flex layout (space-between, vscale-dependent paddings), so a fixed
  // number drifts out of alignment on anything else (user report: "the 3
  // small selector... are not centered with the nom nom coin"). Measured
  // the same way cuisineDropdownTop/Height already are just above -
  // containerRef is the shared coordinate-space anchor both this and the
  // coin are measured against, since QuickFilters is a sibling of
  // containerRef's other children, not nested inside the coin's own
  // wrapping Views.
  const [coinCenterY, setCoinCenterY] = useState(null);
  // Was a single requestAnimationFrame right after mount - not a reliable
  // guarantee real layout had settled (fonts/the coin's own image can still
  // shift things a frame or two later), and with no dependency array this
  // never re-measured, so it could get permanently stuck on a stale/zero
  // reading (user report: the QuickFilters stack still wasn't centered on
  // the coin after this was supposedly fixed). measureCoin is now called
  // from the coin wrapper's own onLayout below instead, which React Native
  // guarantees fires every time that view's real layout is actually
  // computed - including if it ever shifts later, not just once at mount.
  const measureCoin = () => {
    containerRef.current?.measureInWindow((_containerX, containerY) => {
      coinWrapperRef.current?.measureInWindow((_coinX, coinY, _coinW, coinHeight) => {
        setCoinCenterY(coinY - containerY + coinHeight / 2);
      });
    });
  };
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
      //
      // CRITICAL: the cached fix has NO freshness guarantee - Android will
      // hand back whatever it last had, even if that's hours or days old
      // (e.g. the phone's last real fix was in a different city entirely).
      // A real report: a friend's first-ever spin returned San Francisco
      // results while he was actually in Mountain View - exactly this,
      // an unbounded-age stale cached fix used before the accurate one
      // caught up. Only trust the cached fix if it's recent enough that a
      // person couldn't plausibly have traveled far since; otherwise just
      // wait for the real one, same as before this optimization existed.
      const MAX_CACHED_LOCATION_AGE_MS = 5 * 60 * 1000;
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && Date.now() - lastKnown.timestamp < MAX_CACHED_LOCATION_AGE_MS) {
        applyLocationFix(lastKnown);
      }
      let loc = await Location.getCurrentPositionAsync({});
      applyLocationFix(loc);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single entry point for every new GPS fix, so Settings' "last pulled"
  // time/place can never drift from the `location` the searches actually use.
  const applyLocationFix = (fix) => {
    setLocation(fix.coords);
    setLocationMeta((prev) => ({ ...prev, at: fix.timestamp || Date.now(), label: null }));
    Location.reverseGeocodeAsync({ latitude: fix.coords.latitude, longitude: fix.coords.longitude })
      .then(([place]) => {
        if (!place) return;
        const area = place.district || place.subregion;
        const city = place.city || place.subregion;
        const label = [area && area !== city ? area : null, city, place.region].filter(Boolean).join(', ');
        if (label) setLocationMeta((prev) => ({ ...prev, label }));
      })
      .catch(() => {});
  };

  // Settings' refresh button - a fresh fix only costs a Places call later if
  // you've actually moved (places.js keys its cache on a rounded location).
  const refreshLocation = async () => {
    setLocationMeta((prev) => ({ ...prev, refreshing: true }));
    try {
      const loc = await Location.getCurrentPositionAsync({});
      applyLocationFix(loc);
    } catch (e) {
      alert("Couldn't update your location - check that location is on and try again.");
    } finally {
      setLocationMeta((prev) => ({ ...prev, refreshing: false }));
    }
  };

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
      count: 1, openNowOnly, maxPrice, reallyGoodOnly, allowRepeats: true, silent: true,
    }).catch(() => {}).finally(recordWarmCalls);
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

  // Android-only: recovers a join code that couldn't ride a tapped link
  // because the app wasn't installed yet (public/join/index.html sends that
  // case to a Play Store listing URL carrying `referrer=code%3DXXXX` instead,
  // since that's the only link shape Play preserves through an install - see
  // ANDROID_PACKAGE_ID's comment in constants.js). getInstallReferrerAsync()
  // keeps returning the same value on every call, not just the first, so
  // this only ever acts on it once per install (loadInstallReferrerChecked) -
  // otherwise leaving a joined session and relaunching later would silently
  // drop you right back into it.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    (async () => {
      const alreadyChecked = await loadInstallReferrerChecked();
      if (alreadyChecked) return;
      await saveInstallReferrerChecked(true);
      try {
        const referrer = await Application.getInstallReferrerAsync();
        const match = referrer?.match(/(?:^|&)code=([^&]+)/);
        if (match) {
          setPendingJoinCode(decodeURIComponent(match[1]).toUpperCase());
          setActiveView('friend');
        }
      } catch (e) {
        // No Play Store install referrer available (sideloaded build, an
        // emulator without Play Store, or genuinely no referrer) - same
        // best-effort swallow as the rest of storage.js.
      }
    })();
  }, []);

  // Load persisted lists once on startup.
  useEffect(() => {
    (async () => {
      const [h, f, t, seen, p, prefs, faves, frnds, jrnl, travel, onboarded, navCounts, buddy, defaultFriendSeeded] = await Promise.all([
        loadHistory(), loadFavorites(), loadTryLater(), loadSeenIds(),
        loadProfile(), loadPreferences(), loadFaveCuisines(),
        loadFriends(), loadJournal(), loadTravelType(), loadOnboardingSeen(),
        loadNavTapCounts(), loadBuddyAvatar(), loadDefaultFriendSeeded(),
      ]);
      setHistory(h);
      setFavorites(f);
      setTryLater(t);
      seenIdsRef.current = seen;
      setProfile(p);
      setPreferences(prefs);
      setTravelType(travel);
      setOnboardingSeen(onboarded);
      // Older saves stored each slot as a bare cuisine array ([[], [], []])
      // from before slots had names - normalize those up to the current
      // { name, cuisines } shape rather than crashing on the old data. Also
      // covers a genuinely brand-new install (loadFaveCuisines' own default
      // is exactly this same [[], [], []] shape), which is why
      // DEFAULT_FAVE_NAMES (not a generic "Fave N") ends up as every new
      // user's starting slot names.
      setFaveCuisines((faves || []).map((slot, i) => {
        if (Array.isArray(slot)) return { name: DEFAULT_FAVE_NAMES[i] || `Fave ${i + 1}`, cuisines: slot };
        // Saves from before DEFAULT_FAVE_NAMES existed already have the
        // {name, cuisines} shape (so the branch above never fires) but with
        // the plain "Fave N" name baked in from the old useState default -
        // upgrade just the label the same way a brand-new install gets it,
        // without touching whatever cuisines are already saved to that slot
        // (user report: "the latest update doesn't have the faves 1,2,3
        // updated to the new names").
        if (slot?.name === `Fave ${i + 1}` && DEFAULT_FAVE_NAMES[i]) return { ...slot, name: DEFAULT_FAVE_NAMES[i] };
        return slot;
      }));
      // One-time: every new install gets the developer's own account as a
      // default friend, so Feast/journal has something to show from day one
      // (user request). Guarded on the persisted flag, not "friends is
      // empty," so this never reappears after a future "remove friend"
      // feature (doesn't exist yet) lets someone deliberately remove it -
      // and skipped if it's somehow already there (e.g. a real completed
      // session with this exact account) to avoid a duplicate row.
      if (!defaultFriendSeeded) {
        if (!frnds.some((fr) => fr.uid === DEFAULT_FRIEND_UID)) {
          const withDefault = [...frnds, { uid: DEFAULT_FRIEND_UID, name: DEFAULT_FRIEND_NAME }];
          setFriends(withDefault);
          saveFriends(withDefault);
        } else {
          setFriends(frnds);
        }
        saveDefaultFriendSeeded(true);
      } else {
        setFriends(frnds);
      }
      setJournal(jrnl);
      setNavTapCounts(navCounts);
      setBuddyAvatar(buddy || null);
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

  // Favorites/History/Try Later/fave cuisine slots syncing to Firestore -
  // GoogleSignInRow.js already tells the user this happens ("Keeps your
  // favorites, journal, and history saved to your account"), but only
  // Journal actually did (user report: "I don't want to have to keep
  // re-adding info... this should be able to be transferred between
  // phones"). Gated on a real (non-anonymous) sign-in - an anonymous
  // session's data has nowhere durable to sync TO yet, and pushing it would
  // just mean overwriting savedLists/{uid} under a throwaway uid nobody can
  // ever sign back into.
  useEffect(() => {
    if (!storageLoaded || !myUid || auth.currentUser?.isAnonymous) return;
    pushSavedLists(myUid, { favorites, history, tryLater, faveCuisines });
  }, [storageLoaded, myUid, favorites, history, tryLater, faveCuisines]);

  // Pulls the account's remote copy and merges it into local state whenever
  // myUid settles on a real signed-in account - covers both "fresh install,
  // just signed in" (local is empty, remote wins entirely) and "signed in
  // on a second device" (myUid's own onAuthStateChanged listener above
  // already swapped in the ORIGINAL account's uid via signInWithCredential's
  // fallback, so this fires for that switch too). mergeById/mergeFaveCuisines
  // never drop local-only data, so this can safely run every time myUid
  // changes to a real account, not just "the first time ever."
  useEffect(() => {
    if (!storageLoaded || !myUid || auth.currentUser?.isAnonymous) return;
    fetchSavedLists(myUid).then((remote) => {
      if (!remote) return;
      setFavorites((prev) => mergeById(prev, remote.favorites));
      setHistory((prev) => mergeById(prev, remote.history, MAX_HISTORY));
      setTryLater((prev) => mergeById(prev, remote.tryLater));
      setFaveCuisines((prev) => mergeFaveCuisines(prev, remote.faveCuisines));
    });
    // Same restore, for Journal - pushJournal (below) mirrors entries UP to
    // journals/{uid} on every change, but until this existed nothing ever
    // pulled them back DOWN (user report: "i have a few reviews written as
    // well - are those there?" - they were safely in Firestore, there just
    // wasn't a restore path to prove it, unlike favorites/history/tryLater
    // above). A device that already has a journal only asks for entries
    // newer than its newest one (one Firestore read per entry returned);
    // only a fresh install downloads the whole thing. Dev-seeded fakes are
    // ignored when working out "newest" so seeding can't hide real entries.
    const localNewest = Object.values(journal || {})
      .flat()
      .filter((e) => !isFakeEntry(e))
      .reduce((max, e) => Math.max(max, e.updatedAt || 0), 0);
    fetchMyJournal(myUid, localNewest).then((remoteEntries) => {
      if (!remoteEntries || Object.keys(remoteEntries).length === 0) return;
      setJournal((prev) => mergeJournal(prev, remoteEntries));
    });
  }, [storageLoaded, myUid]);
  useEffect(() => { if (storageLoaded) saveTravelType(travelType); }, [travelType, storageLoaded]);
  useEffect(() => { if (storageLoaded) saveNavTapCounts(navTapCounts); }, [navTapCounts, storageLoaded]);
  useEffect(() => { if (storageLoaded && buddyAvatar) saveBuddyAvatar(buddyAvatar); }, [buddyAvatar, storageLoaded]);

  // Hides the overlay for the rest of THIS session either way, but only
  // persists "seen" (so it stays gone on future opens too) if the user left
  // the "Don't show this again" checkbox checked - unchecking it and
  // dismissing means it shows again next launch, per the checkbox's own
  // purpose (user request).
  const dismissOnboarding = (dontShowAgain) => {
    setOnboardingSeen(true);
    if (dontShowAgain) saveOnboardingSeen(true);
  };

  // Handles both call sites of BuddyPicker (see its own render below):
  // first-launch (showBuddyPickerManual false, picking is the only way out)
  // and Settings > Profile's "Change your buddy" (showBuddyPickerManual
  // true, picking also closes it).
  const handlePickBuddy = (key) => {
    setBuddyAvatar(key);
    setShowBuddyPickerManual(false);
  };

  // __DEV__-only (the Settings buttons that call these are gated on it):
  // drop 100 fake reviewed places into the journal to test its grouping/
  // search at volume, or strip them back out. Re-seeding replaces the
  // previous fake set rather than stacking a second copy.
  const seedFakeJournal = () => setJournal((prev) => ({ ...stripFakeEntries(prev), ...buildFakeJournal() }));
  const clearFakeJournal = () => setJournal((prev) => stripFakeEntries(prev));

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
    // Dev-seeded fake reviews (src/dev/fakeJournal.js) never leave the
    // device - this account is every new install's default friend, so
    // mirroring them would put 100 made-up restaurants in real users'
    // Friends tabs.
    const shareable = Object.fromEntries(
      Object.entries(journal)
        .map(([placeId, entries]) => [
          placeId,
          entries.filter((e) => !isFakeEntry(e)).map(({ photoUri, ...rest }) => rest),
        ])
        .filter(([, entries]) => entries.length > 0)
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
          ? pickFromFavorites({ favorites, location, distance, travelType, count: targetCount, openNowOnly })
          : fetchLocalFood({
              location,
              distance,
              minRating,
              selectedCuisines,
              travelType,
              count: targetCount,
              openNowOnly,
              maxPrice,
              reallyGoodOnly,
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
      recordSpin(marked, gameMode);

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
    const label = slot?.name || DEFAULT_FAVE_NAMES[index] || `Fave ${index + 1}`;
    if (saved.length === 0) {
      showToast(`${label} is empty - long-press to save`);
      return;
    }
    setSelectedCuisines(saved);
    showToast(`Loaded ${label}`);
  };
  const handleSaveFave = (index) => {
    const label = faveCuisines[index]?.name || DEFAULT_FAVE_NAMES[index] || `Fave ${index + 1}`;
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

  // Uploads every moment's photo (skipping text-only moments and any moment
  // that already has a sharedUri from a prior save) and returns a new
  // moments array with `sharedUri` attached - used by both addJournalEntry
  // and addAtTheTableEntry, and by editJournalEntry when shared gets turned
  // on later. One Storage object per MOMENT (not per entry), keyed by the
  // moment's own id (journalPhotos.js's photoPath) since a single entry can
  // carry several photos now.
  const uploadSharedMomentPhotos = async (entryId, moments) => {
    if (!myUid || !moments?.length) return moments;
    return Promise.all(
      moments.map(async (m) => {
        if (!m.photoUri || m.sharedUri) return m;
        try {
          const sharedUri = await uploadJournalPhoto(myUid, entryId, m.photoUri, m.id);
          return { ...m, sharedUri };
        } catch (e) {
          console.warn('moment photo upload failed - saving without sharing this one', e);
          return m;
        }
      })
    );
  };

  // Reverses uploadSharedMomentPhotos - deletes every moment's shared photo
  // (best-effort) and strips sharedUri, used when an entry's `shared` flag
  // gets turned off after having been on.
  const deleteSharedMomentPhotos = async (entryId, moments) => {
    if (!myUid || !moments?.length) return moments;
    await Promise.all(
      moments.filter((m) => m.sharedUri).map((m) => deleteJournalPhoto(myUid, entryId, m.id))
    );
    return moments.map((m) => (m.sharedUri ? { ...m, sharedUri: null } : m));
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
  const addJournalEntry = async (placeId, { rating, note, spot, photoUri, moments, shared = true }) => {
    const now = Date.now();
    const id = Math.random().toString(36).slice(2);
    // Shared defaults true now (user decision: "the whole point is
    // connecting with your close friends... if people want to opt out, they
    // should have the option as they're writing") - uploads happen right at
    // compose time instead of the old model where a photo stayed private
    // until a separate later tap. See journalPhotos.js's own updated docs.
    const sharedMoments = shared ? await uploadSharedMomentPhotos(id, moments) : moments;
    const entry = {
      id, rating, note, spot, photoUri, moments: sharedMoments, shared,
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
  // `moments`, so the two shapes coexist without conflict. `rating` was
  // deliberately absent originally ("the point of this flow is a fast note
  // in the moment, not a formal review") - added back per explicit later
  // request; stays optional (undefined, not 0, when nothing was picked -
  // see AtTheTableCompose's own handleSave) so this flow's low-friction
  // intent still holds for anyone who skips it.
  const addAtTheTableEntry = async ({ spot, rating, occasion, moments, shared = true }) => {
    const now = Date.now();
    const id = Math.random().toString(36).slice(2);
    const sharedMoments = shared ? await uploadSharedMomentPhotos(id, moments) : moments;
    const entry = {
      id, spot, rating, occasion, moments: sharedMoments, shared,
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
  const editJournalEntry = async (placeId, entryId, { rating, note, photoUri, moments, shared = true }) => {
    // Uploads/deletes only run on an actual shared-flag CHANGE (or a fresh
    // upload for a moment that didn't have a shared photo yet, e.g. a photo
    // added during this edit) - re-uploading everything on every edit
    // regardless of change would work but wastes bandwidth for no reason.
    const finalMoments = shared
      ? await uploadSharedMomentPhotos(entryId, moments)
      : await deleteSharedMomentPhotos(entryId, moments);
    setJournal((prev) => ({
      ...prev,
      [placeId]: (prev[placeId] || []).map((e) =>
        e.id === entryId
          ? { ...e, rating, note: moments ? undefined : note, photoUri: moments ? undefined : photoUri, moments: finalMoments, shared, updatedAt: Date.now() }
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

  // The actual navigation-away action - only ever called once the user has
  // confirmed (or already turned the warning off), never directly from a
  // tap anymore. See openMaps below.
  const doOpenMaps = (spot) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) Linking.openURL(url);
        else alert("Couldn't open maps on this device.");
      })
      .catch((err) => console.error('An error occurred opening maps', err));
  };

  // Leaving the app to open Maps used to happen with zero warning - a
  // friend's report: "it surprised them that it was taking them to their
  // maps app." Every caller (ResultCard, FriendSpin, HistoryFavoritesOverlay,
  // MyPlacesHub) already goes through this ONE function, so gating it here
  // covers all of them at once rather than touching each screen separately.
  // `pendingMapsSpot` holds the spot mid-confirmation; null means the modal
  // is closed. Tapping the modal's backdrop (same as Cancel) just leaves
  // this null forever for that tap - the original action is voided, not
  // queued or retried.
  const [pendingMapsSpot, setPendingMapsSpot] = useState(null);
  const openMaps = (spot) => {
    if (preferences.mapsWarning === false) {
      doOpenMaps(spot);
      return;
    }
    setPendingMapsSpot(spot);
  };
  const confirmOpenMaps = (dontAskAgain) => {
    if (dontAskAgain) setPreferences((prev) => ({ ...prev, mapsWarning: false }));
    if (pendingMapsSpot) doOpenMaps(pendingMapsSpot);
    setPendingMapsSpot(null);
  };
  const cancelOpenMaps = () => setPendingMapsSpot(null);

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

  // ResultCard's "Flip Again" used to call resetApp - dumping the user all
  // the way back to the idle coin screen just to get another pick (user
  // request: "Flip Again should do exactly that - just give the user a new
  // place"). Now fetches one new spot directly and swaps `result` in place;
  // ResultCard.js reacts to that change with its own photo-flip transition
  // (see its own useEffect on result.id), so this function itself doesn't
  // need to know anything about that animation. Same single-spot fetch
  // shape startRandomizer uses for gameMode 'random', but skips the coin
  // spin/isSearching state entirely - staying on the results screen is the
  // whole point here. allowRepeats: true (not gated on gameMode the way
  // startRandomizer's is) since this always operates on an already-shown
  // single result, never the list mode's own distinct Refresh button.
  const handleFlipAgain = async () => {
    if (!location) return;
    if (favoritesOnly && favorites.length === 0) return;
    try {
      const selectedFoods = favoritesOnly
        ? await pickFromFavorites({ favorites, location, distance, travelType, count: 1, openNowOnly })
        : await fetchLocalFood({
            location, distance, minRating, selectedCuisines, travelType,
            count: 1, openNowOnly, maxPrice, reallyGoodOnly, allowRepeats: true,
          });
      if (selectedFoods.length > 0) {
        const marked = [...selectedFoods];
        marked.forEach((s) => seenIdsRef.current.add(s.id));
        saveSeenIds(seenIdsRef.current);
        addToHistory(marked);
        recordSpin(marked, 'flip');
        setResult(marked[0]);
      }
    } catch (error) {
      console.error('handleFlipAgain failed:', error);
      alert('Something went wrong finding a spot. Please try again.');
    }
  };

  const showFab =
    activeView === 'main' && !isSearching && !result &&
    eliminationList.length === 0 && browseList.length === 0;

  // Exactly the states showFab excludes, minus isSearching (nothing useful
  // to "go back" from mid-spin) - a result, an in-progress elimination
  // bracket, or a Curated list. BottomNav hides here (see showBottomNav
  // right below), which used to resurrect SettingsPanel's own stray gear-
  // trigger fallback in this same bottom-left spot (user report: "the old
  // setting button is sitting on the results page of eliminate... also on
  // surprise me") - that fallback is gone now; this is its real replacement,
  // an actual way out of the results/bracket/list flow back to idle Home.
  const showBackFromResults =
    activeView === 'main' && !isSearching &&
    (!!result || eliminationList.length > 0 || browseList.length > 0);

  // BottomNav now also persists across Places/Favorites/Feast, not just
  // Home (closes the gap TODO.md documented) - it used to unmount the
  // instant activeView left 'main', which is why its sliding highlight
  // never actually appeared to slide (user report: "slider doesn't slide
  // across") - there was nothing wrong with the animation, the whole bar
  // (highlight included) just vanished in the same tap that would have
  // triggered it. Still gated to `showFab`'s idle-Home condition while ON
  // Home, since the bar has never been designed to coexist with the
  // coin/elimination/browse flow.
  const showBottomNav =
    showFab || activeView === 'places' || activeView === 'friend';
  // 'tryLater'/'journal'/'favorites' as raw activeView values are now all
  // dead (nothing sets them anymore) - 'places' is the only destination
  // BottomNav's Places AND Journal icons both land on now, just starting on
  // a different tab (placesTab, lifted here so this computation and
  // BottomNav's own tap handler can both drive/read it) depending on which
  // icon was tapped. HistoryFavoritesOverlay.js/JournalOverlay.js are left
  // otherwise untouched rather than deleted, same as before.
  //
  // showSettingsMenu checked FIRST, ahead of activeView - Settings opens as
  // an overlay ON TOP of Home (activeView stays 'main' the whole time), so
  // without this check activeNavTab could never actually become 'settings'
  // at all: BottomNav's sliding highlight had nothing to move toward when
  // Settings was tapped, not an animation bug (caught on-device - "clicking
  // the bottom 5 icons still doesn't move the selector as expected").
  const activeNavTab =
    showSettingsMenu ? 'settings'
    : activeView === 'main' ? 'home'
    : activeView === 'friend' ? 'feast'
    : activeView === 'places' ? (placesTab === 'journal' ? 'journal' : 'places')
    : null;
  const handleNavSelect = (key) => {
    // Anonymous, local-only usage tracking (see src/storage.js's
    // loadNavTapCounts) - every destination counted the same way regardless
    // of which branch below it takes.
    setNavTapCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));

    if (key === 'settings') {
      setShowSettingsMenu(true);
      return;
    }
    // Tapping any OTHER destination while Settings is open used to leave it
    // open - the drawer only covers the right DRAWER_WIDTH of the screen
    // (see SettingsPanel.js), so Home/Places/Feast's own icons stay exposed
    // and tappable to its left the whole time. Tapping one changed
    // activeView underneath the drawer, but nothing ever reset
    // showSettingsMenu, so the drawer just kept riding on top of whatever
    // screen you landed on (user report: "the left home tap opens the
    // settings drawer" - it was already open, this just failed to close it).
    setShowSettingsMenu(false);
    if (key === 'home') setActiveView('main');
    else if (key === 'places') { setActiveView('places'); setPlacesTab('favorites'); }
    else if (key === 'feast') setActiveView('friend');
    // Journal is the SAME screen as Places (MyPlacesHub), just forced onto
    // its Journal tab every time this icon is tapped (user request:
    // journaling after a meal should be "one click away" - it wasn't
    // getting used otherwise since it was buried a tab deep behind Places).
    else if (key === 'journal') { setActiveView('places'); setPlacesTab('journal'); }
  };

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

      {/* Now fully unreachable - 'favorites' (its last live value) moved
          into MyPlacesHub's own tab set, trading places with Journal.
          Left in place rather than deleted, same as JournalOverlay.js's
          own dead render block just below. */}
      {activeView !== 'main' && activeView !== 'friend' && activeView !== 'journal' && activeView !== 'places' && (
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

      {activeView === 'places' && (
        <MyPlacesHub
          tab={placesTab}
          onChangeTab={setPlacesTab}
          onBack={() => setActiveView('main')}
          favorites={favorites}
          tryLater={tryLater}
          history={history}
          journal={journal}
          friends={friends}
          location={location}
          travelType={travelType}
          onOpenMaps={openMaps}
          onShowDetails={(spot) => setDetailSpot(spot)}
          onRemoveTryLater={toggleTryLater}
          onAddFavorite={toggleFavorite}
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
        {/* Plain View now, not a ScrollView - scrollEnabled was already false
            (filtersScrollRef is never actually called with .scrollTo
            anywhere in this file, confirmed dead) and a ScrollView's own
            sizing behavior was the suspected cause of Cluster Height C's
            layout fix (below) not visibly moving anything: removing this
            component's own sizing quirks from the equation entirely, rather
            than fighting them, is the more robust fix. */}
        <View
          style={[styles.topControlsScroll, styles.topControlsContent]}
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
            showCuisines={showCuisines}
            setShowCuisines={setShowCuisines}
            selectedCuisines={selectedCuisines}
            onToggleCuisine={toggleCuisine}
            onCuisinesExpanded={handleCuisinesExpanded}
            cuisineTriggerRef={cuisineTriggerRef}
            faveCuisines={faveCuisines}
            onLoadFave={handleLoadFave}
            onSaveFave={handleSaveFave}
            onRenameFave={handleRenameFave}
          />
        </View>

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
          {/* Replaces the vertical space the old horizontal mode toggle
              (SlidableSegmented, removed when it moved to GameModeIcons on
              the coin's left) used to occupy here - ~52px of button content
              (padding:4 + paddingVertical:12*2 + text) plus its own
              marginBottom:24. Without this, bottomControls' own intrinsic
              height shrank, which let homeScreen's space-between distribute
              that freed space into the gaps ABOVE it instead - pushing
              RollingFoodStrip down into where the coin's flanking icon
              stacks (GameModeIcons/QuickFilters, both zIndex 45) paint,
              well above topControlsScroll's own zIndex 15 (live user
              report: "the food keeps falling behind the game selector and
              the quick filters"). A plain spacer restores the original
              flex proportions directly instead of re-guessing
              rollingFoodWrap's own margin a third time. */}
          <View style={{ height: 76 * vscale }} />
          <View ref={coinWrapperRef} collapsable={false} onLayout={measureCoin}>
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
            onReset={handleFlipAgain}
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
        // No `visible` prop anymore - SettingsPanel now always renders its
        // drawer (see its own docstring). It used to return null whenever
        // showFab||showSettingsMenu was false, which unmounted the drawer's
        // real native view on every screen except an idle Home even with
        // Settings fully closed, leaving its close animation's resting
        // value stale for the next time it remounted (root cause of "tap
        // Home and the drawer reopens by itself" - confirmed via a screen
        // recording showing BottomNav's own highlight tracking correctly
        // the whole time, so this was never a nav-state bug).
        showSettingsMenu={showSettingsMenu}
        setShowSettingsMenu={setShowSettingsMenu}
        profile={profile}
        setProfile={setProfile}
        preferences={preferences}
        setPreferences={setPreferences}
        minRating={minRating}
        setMinRating={setMinRating}
        myUid={myUid}
        navTapCounts={navTapCounts}
        buddyAvatar={buddyAvatar}
        onChangeBuddy={() => setShowBuddyPickerManual(true)}
        onOpenBugReport={() => setShowBugReport(true)}
        onOpenHelp={() => setShowHelp(true)}
        locationMeta={locationMeta}
        onRefreshLocation={refreshLocation}
        fakeJournalCount={countFakeEntries(journal)}
        onSeedFakeJournal={seedFakeJournal}
        onClearFakeJournal={clearFakeJournal}
      />

      {/* Same bottom-left spot the old stray gear button used to occupy
          (see SettingsPanel.js's own docstring) - a real way out of
          results/bracket/list back to idle Home, since none existed there
          before. */}
      {showBackFromResults && (
        <Pressable style={styles.backFromResultsBtn} onPress={resetApp} hitSlop={6}>
          <Ionicons name="arrow-back" size={22} color={colors.textDark} />
        </Pressable>
      )}

      <ReportBugModal
        visible={showBugReport}
        onClose={() => setShowBugReport(false)}
        myUid={myUid}
        displayName={profile.displayName}
      />

      <HelpModal visible={showHelp} onClose={() => setShowHelp(false)} />
      {/* Gated on !!buddyAvatar - the walkthrough waits for a buddy to
          actually be chosen first (see BuddyPicker just below) rather than
          both first-launch overlays racing to show at once. */}
      <OnboardingOverlay visible={storageLoaded && !onboardingSeen && !!buddyAvatar} onDismiss={dismissOnboarding} />

      {/* First launch (buddyAvatar still null/not-yet-loaded - the '' init
          value keeps this from flashing true before storage resolves) forces
          a pick with no close button; showBuddyPickerManual (Settings >
          Profile's "Change your buddy") reopens the exact same picker but
          dismissible. */}
      <BuddyPicker
        visible={(storageLoaded && !buddyAvatar) || showBuddyPickerManual}
        currentKey={buddyAvatar}
        onPick={handlePickBuddy}
        onClose={showBuddyPickerManual ? () => setShowBuddyPickerManual(false) : undefined}
      />

      <MapsLeaveWarningModal
        visible={pendingMapsSpot != null}
        onConfirm={confirmOpenMaps}
        onCancel={cancelOpenMaps}
      />

      {showBottomNav && <BottomNav activeTab={activeNavTab} onSelect={handleNavSelect} buddyAvatar={buddyAvatar} />}

      <GameModeIcons
        visible={showFab}
        hapticsEnabled={preferences.haptics}
        centerY={coinCenterY}
        gameMode={gameMode}
        onChangeGameMode={(mode) => {
          setGameMode(mode);
          const label = { dontcare: 'Surprise Me', elimination: 'Eliminate', list: 'Curated' }[mode];
          if (label) showToast(label);
        }}
      />

      <QuickFilters
        visible={showFab}
        hapticsEnabled={preferences.haptics}
        centerY={coinCenterY}
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
        reallyGoodOnly={reallyGoodOnly}
        onToggleReallyGood={() => {
          setReallyGoodOnly((prev) => {
            const next = !prev;
            showToast(next ? '🔥 Really Freaking Good Only' : 'Really Freaking Good Off');
            return next;
          });
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
  // Same bottom-left spot SettingsPanel's old stray gear-trigger fallback
  // used to occupy (bottom:30, left:30, before insets.bottom was added
  // here) - see showBackFromResults above for why this exists and when it
  // shows.
  backFromResultsBtn: {
    position: 'absolute', bottom: insets.bottom + 30, left: 30, zIndex: 250,
    backgroundColor: colors.accent, width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center', ...buttonDepth,
  },
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
  // paddingBottom adds insets.bottom (home-indicator/gesture-bar clearance)
  // on top of BOTTOM_NAV_CLEARANCE - BottomNav.js's own real, unscaled
  // dimensions (its bottom offset, height, and that same offset again as
  // the requested gap above it - see that file's own comment), not a
  // decorative buffer. Deliberately NOT multiplied by vscale like
  // paddingTop's push-down is - this exists to clear a real, fixed-size UI
  // element (the nav bar), and letting it shrink on short screens would
  // just let the coin sit behind the bar again exactly where the shrinking
  // hurts most (user report: "the coin is currently cut off by the bottom
  // bar... it needs a little space from the bar").
  // REVERTED back to 'space-between' - briefly tried 'flex-end' (closing the
  // gap between Cuisines and the food strip, pulling the raccoon/panels down
  // with the coin) under a wrong reading of "move the coin down." Corrected
  // by the user directly: the raccoon/travel-selector/cuisines panels are
  // deliberately LOW-CONTACT and belong pinned at the TOP regardless of
  // thumb-reach - only the coin/mode-toggle/QuickFilters cluster (already
  // bottom-anchored by this exact 'space-between' + topControlsScroll's
  // flex:1 below) needed to be reachable. The gap this leaves in the middle
  // is deliberate, not dead space - it's the runway the future feather-drift
  // food animation needs to actually fall and drift before reaching the
  // coin, so it's staying wide rather than being closed up.
  homeScreen: {
    flex: 1, justifyContent: 'space-between',
    paddingTop: insets.top + 38 * vscale,
    paddingBottom: insets.bottom + BOTTOM_NAV_CLEARANCE,
  },
  // REVERTED to the original tuned negative margin (see homeScreen's comment
  // above for why the 'flex-end' experiment this was paired with got undone).
  // Was bumped to -50 when this read as too close to the horizontal mode
  // toggle that used to sit directly below it in bottomControls - that
  // toggle has since moved out entirely (GameModeIcons, coin's left side),
  // so the premise for that bump no longer applies. Back to -38, combined
  // with bottomControls' new compensating spacer (see its comment) which
  // addresses the actual mechanical cause (freed flex space from removing
  // the toggle) rather than re-tuning this number a third time.
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
  // flex:1 RESTORED (see homeScreen's comment above - the gap this creates
  // between the Cuisines panel and the food strip below is deliberate, the
  // future food-drift animation's fall runway, not dead space to close up).
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
  absoluteCenter: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
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
