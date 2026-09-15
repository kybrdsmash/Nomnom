/**
 * Small hex/HSL color helpers used by the theme system to derive a full
 * palette (dark/deep/glow shades) from just the one accent color the user
 * picks in Settings > Appearance, so the picker only needs to expose a
 * single soft color field rather than asking for four separate shades.
 */

export function hexToHsl(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta !== 0) {
    sat = delta / (1 - Math.abs(2 * light - 1));
    switch (max) {
      case r: hue = ((g - b) / delta) % 6; break;
      case g: hue = (b - r) / delta + 2; break;
      default: hue = (r - g) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: hue, s: sat * 100, l: light * 100 };
}

export function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) =>
    Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * `steps` unique colors, all the same hue/saturation as `accentHex`, spread
 * across lightness from near-black to near-white (index 0 darkest, last
 * index lightest) - used to color-code multiple simultaneously-highlighted
 * map pins (SpotsMap.js's BrowseList usage) so each one is visually distinct
 * without introducing unrelated hues. Clamped short of true 0/100 lightness
 * (6/94) so even the two extremes keep a whisper of the actual accent hue,
 * rather than landing on plain black/white that reads as unthemed.
 */
export function accentRamp(accentHex, steps) {
  const { h, s } = hexToHsl(accentHex);
  const n = Math.max(1, steps);
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const l = 6 + t * (94 - 6);
    return hslToHex(h, s, l);
  });
}

/** Black or white, whichever reads legibly on top of `hex` - for a label
 * drawn over one of accentRamp's colors, which spans from very dark to very
 * light. */
export function contrastTextColor(hex) {
  return hexToHsl(hex).l < 55 ? '#FFFFFF' : '#1A222C';
}

/** Derives the full accent family (dark/deep/neon glow) from one picked hex. */
export function deriveAccentShades(accentHex) {
  const { h, s, l } = hexToHsl(accentHex);
  return {
    accent: accentHex,
    accentDark: hslToHex(h, s, Math.max(0, l - 12)),
    accentDeep: hslToHex(h, s, Math.max(0, l - 22)),
    // Bright ring color: same hue the user picked, but pinned to a fixed
    // vivid saturation/lightness rather than nudged from the accent's own
    // s/l. The accent itself is a soft pastel (low sat, high light) -
    // blending from that base barely moved this away from the fill color,
    // so it visually vanished. A fixed vivid tone guarantees contrast
    // against any picked accent.
    neon: hslToHex(h, 90, 62),
    // Halo glow: a much DARKER shade of that same hue - real neon signage
    // reads mainly as a soft, dim ambient glow bleeding into the space just
    // beyond the tube, not a bright line (user feedback, after trying both).
    neonGlow: hslToHex(h, 85, 28),
  };
}
