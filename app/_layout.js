import { Stack } from 'expo-router';

/**
 * Root layout - Phase 1 of the Expo Router migration (see the approved
 * plan, saved outside this repo at ~/.claude/plans/lively-gliding-swan.md).
 * Deliberately minimal right now: the ONLY route
 * that exists yet is app/index.js, which bridges straight into the
 * untouched, existing App.js - and App.js already wraps itself in its own
 * SafeAreaProvider/ThemeProvider (see its own `export default function
 * App()`). Adding those here too would just nest them redundantly for no
 * benefit while App.js is still the one and only screen.
 *
 * This file grows real providers (SavedListsProvider, LocationFiltersProvider,
 * etc. - see the plan) as later phases extract them out of App.js and it
 * stops being a single self-contained bridge route.
 */
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
