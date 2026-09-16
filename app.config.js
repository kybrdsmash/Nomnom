// Dynamic config (not static app.json) so the Android Google Maps key can be
// pulled from the same .env / EAS-secret pattern every other key in this
// project already uses (see CLAUDE.md's Environment setup), instead of
// being hardcoded here. Reuses EXPO_PUBLIC_GOOGLE_API_KEY - same Google
// Cloud project as Places, just needs "Maps SDK for Android" enabled on it
// too. iOS needs no key at all (react-native-maps uses Apple Maps there).
module.exports = {
  expo: {
    name: 'Nomnom_App',
    slug: 'Nomnom_App',
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
    },
    android: {
      package: 'com.peach.nomnomapp',
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
