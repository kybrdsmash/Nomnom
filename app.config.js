// Dynamic config (not static app.json) so the Android Google Maps key can be
// pulled from the same .env / EAS-secret pattern every other key in this
// project already uses (see CLAUDE.md's Environment setup), instead of
// being hardcoded here. Reuses EXPO_PUBLIC_GOOGLE_API_KEY - same Google
// Cloud project as Places, just needs "Maps SDK for Android" enabled on it
// too. iOS needs no key at all (react-native-maps uses Apple Maps there).
module.exports = {
  expo: {
    name: 'Nomnom',
    slug: 'Nomnom_App',
    // Versioning convention: this stays 1.1.x while the auto-incrementing
    // versionCode (eas.json's autoIncrement - "appBuildVersion" in `eas
    // build:list`) climbs from 0 toward 100. Once that build counter hits
    // 100, bump this to 1.2.0 (counter effectively resets its "toward next
    // bump" countdown from there); the next bump after that is 1.3.0 at
    // build 200, and so on - one minor version per 100 builds, not per
    // feature. Update this comment's target each time you bump.
    version: '1.1.0',
    scheme: 'nomnom',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      // Required for any iOS build/App Store submission - Android's
      // equivalent is `android.package` below. Mirrors it for consistency;
      // change this if you register a different bundle ID in App Store
      // Connect.
      bundleIdentifier: 'com.peach.nomnomapp',
      // Registers this app with Firebase natively on iOS - same reasoning as
      // android.googleServicesFile below (Google Sign-In's config plugin
      // needs this to exist; without it, @react-native-google-signin's
      // default withGoogleSignIn plugin path fails since it reads the iOS
      // OAuth client/URL scheme from this file, the same way it reads the
      // Android client from google-services.json). Downloaded via `firebase
      // apps:sdkconfig IOS <iOS app id>` after registering the iOS app in
      // the Firebase console (`firebase apps:create IOS ... --bundle-id
      // com.peach.nomnomapp`) - the iOS app didn't exist in this Firebase
      // project before 2026-10-11, only Android + Web.
      googleServicesFile: './GoogleService-Info.plist',
    },
    android: {
      package: 'com.peach.nomnomapp',
      // Registers this app with Firebase natively on Android - without it,
      // getExpoPushTokenAsync() fails outright ("Default FirebaseApp is
      // not initialized") since only a Web app was ever registered in this
      // Firebase project before now (that's what the EXPO_PUBLIC_FIREBASE_*
      // env vars are - fine for Firestore/Auth/Storage via the JS SDK, but
      // native push notifications specifically need this file). Root-caused
      // while debugging why zero Android devices ever successfully received
      // a push notification, tonight or before.
      googleServicesFile: './google-services.json',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_API_KEY,
        },
      },
      // Android App Links (verified https, not the nomnom:// custom scheme)
      // for friend-spin join links - a custom scheme URL just shows as
      // plain unclickable text in SMS/WhatsApp/etc (only http/https get
      // auto-linkified), which is why joins were failing (user report:
      // "sending the link/code, its not clickable"). autoVerify: true is
      // what makes Android silently check .well-known/assetlinks.json
      // (hosted on Firebase Hosting - see public/.well-known/, deployed
      // separately via `firebase deploy --only hosting`, not part of the
      // app bundle) and open the app directly instead of a browser, IF that
      // verification succeeds - see TODO.md for the full setup notes.
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'nom-nom-83f11.web.app',
              pathPrefix: '/join',
            },
          ],
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    // Links this project to its EAS project (account: isaacfinger) - set once
    // by `eas init`, which can't auto-write to a dynamic (.js) config file.
    extra: {
      eas: {
        projectId: '95d6c302-0f94-4e28-9ae7-c30723db7544',
      },
    },
    plugins: [
      // Powers the app/ directory file-based routing (navigation
      // migration) - couldn't be auto-added by `expo install` since this
      // is a dynamic (.js) config file, same reason extra.eas above had to
      // be set by hand.
      'expo-router',
      'expo-asset',
      'expo-web-browser',
      // Real native Google Sign-In (Android Credential Manager under the
      // hood) - replaces expo-auth-session's browser-based OAuth flow for
      // Google specifically, which Google now rejects on real native
      // Android builds ("Access blocked: this app's request is invalid").
      // Expo's own current docs no longer recommend expo-auth-session's
      // Google provider for native Android at all. Needs no config here -
      // it reads the SHA-1/package match from google-services.json, already
      // wired in above.
      '@react-native-google-signin/google-signin',
      '@react-native-community/datetimepicker',
      [
        'expo-location',
        {
          // Store review (both Apple and Google) checks that this actually
          // explains why - the generic auto-generated default text is a
          // common rejection reason. Only "when in use" is needed; this app
          // never reads location in the background.
          locationWhenInUsePermission: 'Nomnom uses your location to find nearby restaurants and estimate travel time to them.',
        },
      ],
      [
        'expo-image-picker',
        {
          // Same store-review reasoning as expo-location above - both
          // permission strings need to explain WHY, not just exist. Photo
          // library access is for attaching a picture to a journal entry;
          // camera is offered as the other picker option in the same flow.
          photosPermission: 'Nomnom uses your photos to let you attach a picture to a food journal entry.',
          cameraPermission: 'Nomnom uses your camera to let you attach a picture to a food journal entry.',
        },
      ],
      [
        'expo-media-library',
        {
          // Lets a journal photo (yours, or one a friend shared) be saved
          // back out to the device's own photo library (user request: "add
          // a download function for all photos"). `photosPermission` here
          // sets the SAME iOS key (NSPhotoLibraryUsageDescription) as
          // expo-image-picker's own entry above - repeated verbatim rather
          // than left to this plugin's generic default text, since whichever
          // plugin resolves last would otherwise silently win that shared
          // key and could clobber the specific, store-review-safe wording
          // already established above with a vague fallback.
          photosPermission: 'Nomnom uses your photos to let you attach a picture to a food journal entry.',
          savePhotosPermission: 'Nomnom saves a photo to your library when you tap download on a journal photo.',
          // This feature only ever WRITES a photo to the library
          // (saveToLibraryAsync) - it never reads/lists the user's existing
          // photos, so there's no reason to request READ_MEDIA_IMAGES/
          // READ_MEDIA_VIDEO/READ_MEDIA_AUDIO at all (the plugin's own
          // default requests all three unconditionally). Those specific
          // permissions are exactly what trips Google Play's "Photo & Video
          // Permissions" policy - a mandatory Play Console declaration of
          // the app's core use case before ANY upload requesting them is
          // even accepted (real submission failure, 2026-10-11: "All
          // developers requesting access to the photo and video permissions
          // are required to tell Google Play about the core functionality of
          // their app"). Scoping the request down to match what this
          // feature actually does - write-only - avoids that requirement
          // entirely rather than just filling out a justification for
          // access the app doesn't need.
          granularPermissions: [],
        },
      ],
      [
        'expo-audio',
        {
          // Same store-review reasoning as expo-location/expo-image-picker
          // above. Microphone access is only ever for the "At the Table"
          // journal note's voice-to-text button - never used in the
          // background, never recorded without the user tapping to start.
          microphonePermission: 'Nomnom uses your microphone to turn a spoken note into text for your food journal.',
        },
      ],
      [
        'expo-notifications',
        {
          // Shown as the small status-bar icon on Android notifications -
          // reuses the same source art as the adaptive icon (a plain
          // silhouette works better than the full-color icon at that size,
          // but this is a reasonable placeholder until a dedicated
          // monochrome asset exists).
          icon: './assets/adaptive-icon.png',
          color: '#ffffff',
        },
      ],
    ],
  },
};
