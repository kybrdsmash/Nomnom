import React, { createContext, useContext, useEffect, useState } from 'react';
import { COLORS as BASE_COLORS } from './constants';
import { deriveAccentShades } from './utils/color';
import { loadTheme, saveTheme } from './storage';

// The current "Frost" icy blue is the default until the user picks their own
// accent in Settings > Appearance - a single soft color field, not named
// presets (user feedback: a color picker is more flexible than curated
// theme names).
const DEFAULT_ACCENT = BASE_COLORS.accent;

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [accentColor, setAccentColorState] = useState(DEFAULT_ACCENT);

  useEffect(() => {
    (async () => {
      const stored = await loadTheme();
      if (stored?.accentColor) setAccentColorState(stored.accentColor);
    })();
  }, []);

  const setAccentColor = (hex) => {
    setAccentColorState(hex);
    saveTheme({ accentColor: hex });
  };

  // Only the accent family is user-adjustable; background/card/text/danger
  // stay fixed so the app doesn't need a full light/dark redesign just to
  // support a custom accent color.
  const colors = { ...BASE_COLORS, ...deriveAccentShades(accentColor) };

  return (
    <ThemeContext.Provider value={{ colors, accentColor, setAccentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
