module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required by react-native-reanimated (a hard peer dependency of
    // expo-router, pulled in for the navigation migration) - must be the
    // LAST plugin in this array, a long-standing Reanimated requirement.
    // This version of reanimated/plugin is a thin re-export of
    // react-native-worklets/plugin (confirmed by reading the actual file),
    // so this one entry covers both.
    plugins: ['react-native-reanimated/plugin'],
  };
};
