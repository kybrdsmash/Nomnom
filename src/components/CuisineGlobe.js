import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, PanResponder, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle, Ellipse, G, Defs, RadialGradient, Stop, ClipPath, Text as SvgText } from 'react-native-svg';
import { geoOrthographic, geoPath, geoCircle, geoDistance, geoRotation } from 'd3-geo';
import { feature } from 'topojson-client';
import land110m from 'world-atlas/land-110m.json';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { useVerticalScale } from '../constants';

/**
 * Home-screen cuisine filter as a small rotating globe (prototype, replaces
 * DaydreamRaccoon + RollingFoodStrip at the top of the home screen). Pure JS
 * (react-native-svg + d3-geo), so it runs in Expo Go - no native module.
 *
 * - Tilted on Earth's real axis (23.4deg) like a desk globe, and only ever
 *   spins around that polar axis - drift and drag both just change
 *   longitude (user request: one axis at a time).
 * - The night side is shaded from the real sun position (UTC time), and a
 *   soft warm glow sits on whichever screen edge the sun is coming from.
 *   The glow fades out while the user is spinning and comes back after.
 * - Each region pin glows warm while it's a mealtime there.
 * - Tapping a pin (or a region chip below) spins to that region and zooms
 *   in, and the chip row swaps to that region's cuisines. "World" goes back.
 *
 * Cuisine names must match CUISINES in constants.js exactly - they feed the
 * same selectedCuisines/toggleCuisine as the old dropdown.
 */
// Each region: a flat, one-tap list of its cuisines (popular ones like
// Sushi/Ramen included directly, so nobody has to find Japan first), plus
// country dots that appear once the region is zoomed in - tapping a country
// dot turns on that country's cuisines. `allExtra` rides along with the
// region's "All" chip without getting a chip of its own (e.g. Google's
// generic asian_restaurant type).
export const CUISINE_REGIONS = [
  { key: 'eastAsia', label: 'East Asia', lonLat: [120, 34], utcOffset: 9, allExtra: ['Asian'],
    cuisines: ['Chinese', 'Dim Sum', 'Dumplings', 'Hot Pot', 'Taiwanese', 'Japanese', 'Sushi', 'Ramen', 'Korean', 'Korean BBQ'],
    countries: [
      { label: 'China', lonLat: [104, 35], cuisines: ['Chinese', 'Dim Sum', 'Dumplings', 'Hot Pot'] },
      { label: 'Japan', lonLat: [138, 37], cuisines: ['Japanese', 'Sushi', 'Ramen'] },
      { label: 'Korea', lonLat: [127.8, 36.4], cuisines: ['Korean', 'Korean BBQ'] },
      { label: 'Taiwan', lonLat: [121, 23.7], cuisines: ['Taiwanese'] },
    ] },
  { key: 'seAsia', label: 'Southeast Asia', lonLat: [105, 12], utcOffset: 7, allExtra: ['Asian'],
    cuisines: ['Thai', 'Vietnamese', 'Filipino', 'Malaysian', 'Indonesian', 'Burmese', 'Cambodian'],
    countries: [
      { label: 'Thailand', lonLat: [101, 15.5], cuisines: ['Thai'] },
      { label: 'Vietnam', lonLat: [106.5, 16], cuisines: ['Vietnamese'] },
      { label: 'Philippines', lonLat: [122, 12.5], cuisines: ['Filipino'] },
      { label: 'Malaysia', lonLat: [102, 4], cuisines: ['Malaysian'] },
      { label: 'Indonesia', lonLat: [113, -2], cuisines: ['Indonesian'] },
      { label: 'Myanmar', lonLat: [96, 21], cuisines: ['Burmese'] },
      { label: 'Cambodia', lonLat: [105, 12.5], cuisines: ['Cambodian'] },
    ] },
  { key: 'southAsia', label: 'South Asia', lonLat: [78, 22], utcOffset: 5.5,
    cuisines: ['Indian', 'South Indian', 'Pakistani', 'Bangladeshi', 'Sri Lankan', 'Himalayan', 'Afghan'],
    countries: [
      { label: 'India', lonLat: [79, 22], cuisines: ['Indian', 'South Indian'] },
      { label: 'Pakistan', lonLat: [70, 30], cuisines: ['Pakistani'] },
      { label: 'Bangladesh', lonLat: [90, 24], cuisines: ['Bangladeshi'] },
      { label: 'Sri Lanka', lonLat: [80.7, 7.8], cuisines: ['Sri Lankan'] },
      { label: 'Nepal & Tibet', lonLat: [86, 29.5], cuisines: ['Himalayan'] },
      { label: 'Afghanistan', lonLat: [66, 34], cuisines: ['Afghan'] },
    ] },
  { key: 'middleEast', label: 'Middle East', lonLat: [42, 33], utcOffset: 3,
    cuisines: ['Middle Eastern', 'Lebanese', 'Turkish', 'Persian', 'Israeli', 'Armenian', 'Falafel', 'Shawarma', 'Halal'],
    countries: [
      { label: 'Lebanon', lonLat: [35.8, 33.9], cuisines: ['Lebanese'] },
      { label: 'Turkey', lonLat: [35, 39], cuisines: ['Turkish'] },
      { label: 'Iran', lonLat: [53, 32], cuisines: ['Persian'] },
      { label: 'Israel', lonLat: [35, 31.4], cuisines: ['Israeli'] },
      { label: 'Armenia', lonLat: [45, 40.1], cuisines: ['Armenian'] },
    ] },
  { key: 'europe', label: 'Europe', lonLat: [10, 47], utcOffset: 1,
    cuisines: ['Italian', 'Pizza', 'French', 'Spanish', 'Tapas', 'Greek', 'Mediterranean', 'German', 'British', 'Portuguese', 'Eastern European'],
    countries: [
      { label: 'Italy', lonLat: [12.5, 42.8], cuisines: ['Italian', 'Pizza'] },
      { label: 'France', lonLat: [2.3, 46.6], cuisines: ['French'] },
      { label: 'Spain', lonLat: [-3.7, 40.3], cuisines: ['Spanish', 'Tapas'] },
      { label: 'Greece', lonLat: [22, 39], cuisines: ['Greek'] },
      { label: 'Germany', lonLat: [10.4, 51], cuisines: ['German'] },
      { label: 'UK', lonLat: [-2, 54], cuisines: ['British'] },
      { label: 'Portugal', lonLat: [-8.2, 39.6], cuisines: ['Portuguese'] },
      { label: 'Eastern Europe', lonLat: [25, 50], cuisines: ['Eastern European'] },
    ] },
  { key: 'africa', label: 'Africa', lonLat: [15, 10], utcOffset: 2,
    cuisines: ['African', 'Ethiopian', 'Moroccan'],
    countries: [
      { label: 'Ethiopia', lonLat: [39.5, 9], cuisines: ['Ethiopian'] },
      { label: 'Morocco', lonLat: [-6, 32], cuisines: ['Moroccan'] },
      { label: 'West Africa', lonLat: [5, 9.5], cuisines: ['African'] },
    ] },
  { key: 'northAmerica', label: 'North America', lonLat: [-98, 37], utcOffset: -6,
    cuisines: ['American', 'Burgers', 'BBQ', 'Steakhouse', 'Wings', 'Diner', 'Cajun', 'Soul Food', 'Tex-Mex', 'Hawaiian'],
    countries: [
      { label: 'USA', lonLat: [-98, 40], cuisines: ['American', 'Burgers', 'BBQ', 'Steakhouse', 'Wings', 'Diner'] },
      { label: 'Texas', lonLat: [-99, 31], cuisines: ['Tex-Mex'] },
      { label: 'Louisiana', lonLat: [-91.5, 31], cuisines: ['Cajun'] },
      { label: 'US South', lonLat: [-86.5, 33.5], cuisines: ['Soul Food'] },
      { label: 'Hawaii', lonLat: [-157, 20.8], cuisines: ['Hawaiian'] },
    ] },
  { key: 'latinAmerica', label: 'Latin America', lonLat: [-80, 5], utcOffset: -5,
    cuisines: ['Mexican', 'Tacos', 'Cuban', 'Caribbean', 'Colombian', 'Peruvian', 'Brazilian', 'Argentinian', 'Latin American'],
    countries: [
      { label: 'Mexico', lonLat: [-102, 23.6], cuisines: ['Mexican', 'Tacos'] },
      { label: 'Cuba', lonLat: [-79, 21.5], cuisines: ['Cuban'] },
      { label: 'Caribbean', lonLat: [-72, 18.5], cuisines: ['Caribbean'] },
      { label: 'Colombia', lonLat: [-74, 4.6], cuisines: ['Colombian'] },
      { label: 'Peru', lonLat: [-75, -9.2], cuisines: ['Peruvian'] },
      { label: 'Brazil', lonLat: [-51.9, -14.2], cuisines: ['Brazilian'] },
      { label: 'Argentina', lonLat: [-64, -34], cuisines: ['Argentinian'] },
    ] },
];

// Not tied to a place - small themed groups (no pin on the globe).
export const OTHER_GROUPS = [
  { key: 'bites', label: 'Bites', cuisines: ['Pizza', 'Sandwiches', 'Deli', 'Bagels', 'Breakfast', 'Salads', 'Seafood', 'Bakery'] },
  { key: 'sweets', label: 'Sweets', cuisines: ['Dessert', 'Pastry', 'Donuts', 'Ice Cream', 'Candy', 'Chocolate', 'Acai'] },
  { key: 'drinks', label: 'Drinks', cuisines: ['Coffee', 'Tea', 'Cafe', 'Juice'] },
];
const ALL_GROUPS = [...CUISINE_REGIONS, ...OTHER_GROUPS];
// The leaf toggle at the end of the first chip row (user request: a full
// "Plant-based" chip set it apart too much and cost a whole row).
const PLANT_BASED = ['Vegan', 'Vegetarian'];
const LEAF_GREEN = '#7BD88F';
// How many chips share the first row with the leaf; the rest wrap below.
const FIRST_ROW_CHIPS = 3;
const groupAll = (g) => [...g.cuisines, ...(g.allExtra || [])];

// The chip rows size themselves; the globe takes whatever height is left
// (measured on globeArea), so fewer rows = a bigger globe.
const CHIP_H = 30;
const CHIP_GAP = 6;
const MIN_GLOBE = 120;
const MAX_GLOBE = 360;

const LAND = feature(land110m, land110m.objects.land);
const AXIAL_TILT = 23.44; // degrees, Earth's real obliquity
const VIEW_PHI = -8; // look very slightly down on the globe
const SPIN_DEG_PER_SEC = 6;
const FRAME_MS = 50; // ~20fps is plenty for a slow drift and keeps cheap phones smooth
const RESUME_AFTER_DRAG_MS = 4000;
const ZOOM_IN = 1.7;
const FLY_MS = 700;
const TAP_RADIUS = 24; // px - roughly a fingertip around each dot
const GLOW_FADE_OUT_MS = 1200;
const GLOW_FADE_IN_MS = 900;
const GLOW_RGB = '#FFBA6E'; // soft warm sunlight

// Approximate subsolar point (good to ~1 degree, plenty for shading).
function subsolarPoint(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = (date.getTime() - start) / 86400000;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60;
  return [-15 * (utcHours - 12), declination];
}

function isMealtime(utcOffset, date) {
  const local = (date.getUTCHours() + date.getUTCMinutes() / 60 + utcOffset + 24) % 24;
  return (local >= 7 && local < 9.5) || (local >= 11 && local < 14) || (local >= 17 && local < 21.5);
}

const isOtherGroup = (key) => OTHER_GROUPS.some((g) => g.key === key);

// Shortest signed angle from a to b, in degrees.
const angleDelta = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;

export default function CuisineGlobe({ selectedCuisines, onToggleCuisine, setSelectedCuisines }) {
  const { colors } = useTheme();
  const vscale = useVerticalScale();
  const win = useWindowDimensions();
  // Globe fills whatever space the chips leave it (globeArea, measured below).
  const [box, setBox] = useState(null);
  const size = box
    ? Math.round(Math.max(MIN_GLOBE, Math.min(MAX_GLOBE, box.w - 32, box.h - 8)))
    : Math.round(170 * vscale);
  const styles = useMemo(() => makeStyles(colors, size), [colors, size]);

  const [lambda, setLambda] = useState(-10);
  const [zoom, setZoom] = useState(1);
  // Latitude of the picked region. While zoomed in, the globe tips to look
  // straight at it and drops its 23.4deg tilt, so a drag spins it around a
  // plain vertical axis (user feedback: the tilted spin felt wrong up close).
  const [focusLat, setFocusLat] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [activeRegion, setActiveRegion] = useState(null); // region key, an OTHER_GROUPS key, or null

  const lambdaRef = useRef(lambda);
  lambdaRef.current = lambda;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const pausedUntilRef = useRef(0);
  const flyRef = useRef(null);
  const activeRegionRef = useRef(activeRegion);
  activeRegionRef.current = activeRegion;
  const panStartRef = useRef(lambda);
  const draggingRef = useRef(false);
  // Screen positions of every tappable dot from the latest render. SVG's own
  // onPress was unreliable here, so the globe's touch handler hit-tests
  // these itself (nearest dot within TAP_RADIUS).
  const tapTargetsRef = useRef([]);
  const glowFade = useRef(new Animated.Value(1)).current;

  // Sun position / mealtimes only need refreshing once a minute.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // One timer drives both the idle drift and fly-to animations.
  useEffect(() => {
    let last = Date.now();
    const id = setInterval(() => {
      const t = Date.now();
      const dt = (t - last) / 1000;
      last = t;
      const fly = flyRef.current;
      if (fly) {
        const p = Math.min(1, (t - fly.start) / FLY_MS);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        setLambda(fly.lFrom + fly.lDelta * e);
        setZoom(fly.zFrom + (fly.zTo - fly.zFrom) * e);
        if (p >= 1) flyRef.current = null;
        return;
      }
      if (activeRegionRef.current && !isOtherGroup(activeRegionRef.current)) return; // hold on a region
      if (t < pausedUntilRef.current) return;
      setLambda(lambdaRef.current + SPIN_DEG_PER_SEC * dt);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, []);

  const flyTo = (lon, zTo) => {
    const lFrom = lambdaRef.current;
    flyRef.current = {
      lFrom,
      lDelta: angleDelta(lFrom, -lon),
      zFrom: zoomRef.current,
      zTo,
      start: Date.now(),
    };
  };

  const selectRegion = (key) => {
    if (isOtherGroup(key)) {
      setActiveRegion(key);
      return;
    }
    const region = CUISINE_REGIONS.find((r) => r.key === key);
    setActiveRegion(key);
    setFocusLat(region.lonLat[1]);
    flyTo(region.lonLat[0], ZOOM_IN);
  };

  const backToWorld = () => {
    setActiveRegion(null);
    flyTo(-lambdaRef.current, 1);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
        onPanResponderGrant: () => {
          draggingRef.current = false;
          panStartRef.current = lambdaRef.current;
        },
        // Horizontal drag only - spins around the globe's axis (tilted in
        // world view, upright when zoomed on a region).
        onPanResponderMove: (_, g) => {
          if (!draggingRef.current) {
            if (Math.abs(g.dx) <= 4) return;
            draggingRef.current = true;
            flyRef.current = null;
            pausedUntilRef.current = Infinity;
            panStartRef.current = lambdaRef.current;
            Animated.timing(glowFade, { toValue: 0, duration: GLOW_FADE_OUT_MS, useNativeDriver: true }).start();
          }
          const k = 90 / (size / 2) / zoomRef.current;
          setLambda(panStartRef.current + g.dx * k);
        },
        onPanResponderRelease: (evt) => {
          if (draggingRef.current) return endDrag();
          const { locationX: tx, locationY: ty } = evt.nativeEvent;
          let best = null;
          let bestD = TAP_RADIUS;
          for (const t of tapTargetsRef.current) {
            const d = Math.hypot(t.x - tx, t.y - ty);
            if (d < bestD) { best = t; bestD = d; }
          }
          if (best) best.onTap();
        },
        onPanResponderTerminate: () => { if (draggingRef.current) endDrag(); },
      }),
    [size]
  );
  function endDrag() {
    draggingRef.current = false;
    pausedUntilRef.current = Date.now() + RESUME_AFTER_DRAG_MS;
    Animated.timing(glowFade, { toValue: 1, duration: GLOW_FADE_IN_MS, useNativeDriver: true }).start();
  }

  // 0 = world view (tilted, looking slightly down), 1 = fully zoomed on a
  // region (upright, looking straight at it). Eases with the zoom itself.
  const zoomAmt = focusLat == null ? 0 : Math.max(0, Math.min(1, (zoom - 1) / (ZOOM_IN - 1)));
  const phi = VIEW_PHI * (1 - zoomAmt) - (focusLat || 0) * zoomAmt;
  const rotate = [lambda, phi, AXIAL_TILT * (1 - zoomAmt)];
  const projection = useMemo(() => {
    const c = size / 2;
    return geoOrthographic()
      .scale((c - 2) * zoom)
      .translate([c, c])
      .rotate([lambda, phi, AXIAL_TILT * (1 - zoomAmt)])
      .clipAngle(90);
  }, [size, zoom, lambda, phi, zoomAmt]);
  const path = useMemo(() => geoPath(projection), [projection]);

  const landD = path(LAND);
  const sun = subsolarPoint(now);
  const nightD = path(geoCircle().center([sun[0] + 180, -sun[1]]).radius(90)());
  const sphereD = path({ type: 'Sphere' });

  // Where the sun is relative to the viewer: x right, y up, z toward us.
  const [sl, sp] = geoRotation(rotate)(sun);
  const toRad = Math.PI / 180;
  const sunX = Math.cos(sp * toRad) * Math.sin(sl * toRad);
  const sunY = Math.sin(sp * toRad);
  // One soft radial glow parked just off-screen on the sun's side of the
  // globe (screen space: x right, y down), strength = how sideways the sun is.
  const glowStrength = Math.min(1, Math.hypot(sunX, sunY));
  const dirX = glowStrength > 0.01 ? sunX / Math.hypot(sunX, sunY) : 0;
  const dirY = glowStrength > 0.01 ? -sunY / Math.hypot(sunX, sunY) : 0;
  const glowH = win.height * 1.1;
  const globeCy = GLOW_BLEED_TOP + (box ? box.h / 2 : size / 2);
  const glowCx = win.width / 2 + dirX * win.width * 0.75;
  const glowCy = globeCy + dirY * win.width * 0.75;

  const selectedSet = new Set(selectedCuisines);
  const regionHasSelection = (cuisines) => cuisines.some((c) => selectedSet.has(c));
  const allSelected = (cuisines) => cuisines.length > 0 && cuisines.every((c) => selectedSet.has(c));
  // Turns a set of cuisines all on, or all off if they're already all on.
  const toggleSet = (cuisines) =>
    setSelectedCuisines((prev) =>
      cuisines.every((c) => prev.includes(c))
        ? prev.filter((c) => !cuisines.includes(c))
        : [...prev, ...cuisines.filter((c) => !prev.includes(c))]
    );
  const isVisible = (lonLat) => geoDistance(lonLat, [-lambda, -phi]) <= Math.PI / 2 - 0.1;
  const activeGeo = CUISINE_REGIONS.find((r) => r.key === activeRegion) || null;
  const zoomedIn = activeGeo && zoom > 1.3;

  const tapTargets = [];
  // Once a region is zoomed in, its single dot splits into country dots.
  const countryPins = zoomedIn
    ? activeGeo.countries.map((ct) => {
        if (!isVisible(ct.lonLat)) return null;
        const pt = projection(ct.lonLat);
        if (!pt) return null;
        const [x, y] = pt;
        // West-side countries label to the left of their dot, east-side to the
        // right, so neighbours' names don't pile up on each other.
        const labelLeft = ct.lonLat[0] < activeGeo.lonLat[0];
        tapTargets.push({ x, y, onTap: () => toggleSet(ct.cuisines) });
        const on = allSelected(ct.cuisines);
        const some = regionHasSelection(ct.cuisines);
        return (
          <G key={ct.label}>
            {on && <Circle cx={x} cy={y} r={8} fill={colors.neon} opacity={0.25} />}
            <Circle
              cx={x}
              cy={y}
              r={4}
              fill={some ? colors.neon : colors.textLight}
              stroke={colors.background}
              strokeWidth={1}
            />
            <SvgText
              x={labelLeft ? x - 6 : x + 6}
              y={y + 3}
              textAnchor={labelLeft ? 'end' : 'start'}
              fontSize={9}
              fontWeight="600"
              fill={colors.textLight}
              stroke={colors.background}
              strokeWidth={0.6}
              opacity={0.9}
            >
              {ct.label}
            </SvgText>
          </G>
        );
      })
    : [];

  const pins = CUISINE_REGIONS.map((r) => {
    if (zoomedIn && r.key === activeRegion) return null;
    if (!isVisible(r.lonLat)) return null;
    const pt = projection(r.lonLat);
    if (!pt) return null;
    const [x, y] = pt;
    tapTargets.push({ x, y, onTap: () => selectRegion(r.key) });
    const meal = isMealtime(r.utcOffset, now);
    const picked = regionHasSelection(r.cuisines);
    const active = activeRegion === r.key;
    return (
      <G key={r.key}>
        {meal && <Circle cx={x} cy={y} r={9} fill="#FFB347" opacity={0.35} />}
        <Circle
          cx={x}
          cy={y}
          r={active ? 6 : 4.5}
          fill={picked ? colors.neon : meal ? '#FFD27A' : colors.textLight}
          stroke={colors.background}
          strokeWidth={1}
        />
      </G>
    );
  });

  tapTargetsRef.current = tapTargets;

  const chip = (label, onPress, { selected = false, dim = false, other = false, key } = {}) => (
    <Pressable
      key={key || label}
      onPress={onPress}
      style={[styles.chip, other && styles.chipOther, selected && styles.chipSelected, dim && styles.chipDim]}
      hitSlop={4}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );

  let chips;
  if (!activeRegion) {
    chips = [
      chip('All', () => setSelectedCuisines([]), { selected: selectedCuisines.length === 0, key: '__all' }),
      ...CUISINE_REGIONS.map((r) =>
        chip(r.label, () => selectRegion(r.key), { selected: regionHasSelection(r.cuisines), key: r.key })
      ),
      ...OTHER_GROUPS.map((g) =>
        chip(g.label, () => selectRegion(g.key), { selected: regionHasSelection(g.cuisines), key: g.key, other: true })
      ),
    ];
  } else {
    const group = ALL_GROUPS.find((r) => r.key === activeRegion);
    const list = group.cuisines;
    chips = [
      chip('‹ World', backToWorld, { dim: true, key: '__back' }),
      chip('All', () => toggleSet(groupAll(group)), { selected: allSelected(groupAll(group)), key: '__all' }),
      ...list.map((c) => chip(c, () => onToggleCuisine(c), { selected: selectedSet.has(c), key: c })),
    ];
  }

  const plantOn = allSelected(PLANT_BASED);
  const c = size / 2;
  return (
    <View style={styles.wrap}>
      {/* Warm sun glow on the screen edge facing the sun. Bleeds past this
          component's own box; never takes touches. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.glowLayer, { height: glowH, opacity: glowFade }]}
      >
        <Svg width={win.width} height={glowH}>
          <Defs>
            <RadialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={GLOW_RGB} stopOpacity={0.34} />
              <Stop offset="55%" stopColor={GLOW_RGB} stopOpacity={0.12} />
              <Stop offset="100%" stopColor={GLOW_RGB} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse
            cx={glowCx}
            cy={glowCy}
            rx={win.width * 0.6}
            ry={glowH * 0.42}
            fill="url(#sunGlow)"
            opacity={glowStrength}
          />
        </Svg>
      </Animated.View>

      <View
        style={styles.globeArea}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          if (!box || Math.abs(box.w - w) > 1 || Math.abs(box.h - h) > 1) setBox({ w, h });
        }}
      >
      <View {...panResponder.panHandlers} style={styles.globeBox}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="ocean" cx="40%" cy="35%" r="70%">
              <Stop offset="0%" stopColor={colors.accentDeep} stopOpacity={0.55} />
              <Stop offset="100%" stopColor={colors.card} stopOpacity={1} />
            </RadialGradient>
            {/* Keeps the zoomed-in globe inside a round lens */}
            <ClipPath id="lens">
              <Circle cx={c} cy={c} r={c - 1} />
            </ClipPath>
          </Defs>
          <G clipPath="url(#lens)">
            <Path d={sphereD} fill="url(#ocean)" />
            <Path d={landD} fill={colors.accent} opacity={0.85} />
            {nightD ? <Path d={nightD} fill="#05070C" opacity={0.45} /> : null}
            {pins}
            {countryPins}
          </G>
          <Circle cx={c} cy={c} r={c - 1} fill="none" stroke={colors.neon} strokeOpacity={0.35} strokeWidth={1} />
        </Svg>
      </View>
      </View>
      <View style={styles.chipArea}>
        <View style={styles.firstRow}>
          <View style={styles.firstRowChips}>{chips.slice(0, FIRST_ROW_CHIPS)}</View>
          <Pressable
            onPress={() => toggleSet(PLANT_BASED)}
            hitSlop={8}
            style={[styles.leaf, plantOn && styles.leafOn]}
            accessibilityLabel="Plant-based (vegan and vegetarian)"
          >
            <Ionicons name={plantOn ? 'leaf' : 'leaf-outline'} size={16} color={plantOn ? LEAF_GREEN : colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.restRows}>{chips.slice(FIRST_ROW_CHIPS)}</View>
      </View>
    </View>
  );
}

const GLOW_BLEED_TOP = 200; // glow layer starts above this component, under the status bar
const makeStyles = (colors, size) =>
  StyleSheet.create({
    wrap: { flex: 1, width: '100%', alignItems: 'center' },
    globeArea: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
    glowLayer: { position: 'absolute', left: 0, right: 0, top: -GLOW_BLEED_TOP },
    globeBox: { width: size, height: size },
    chipArea: { alignSelf: 'stretch', paddingHorizontal: 16, marginTop: 8, gap: CHIP_GAP },
    firstRow: { flexDirection: 'row', alignItems: 'center' },
    firstRowChips: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: CHIP_GAP },
    restRows: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: CHIP_GAP },
    leaf: {
      width: CHIP_H, height: CHIP_H, borderRadius: CHIP_H / 2, marginLeft: CHIP_GAP,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardAlt,
    },
    // Green take on the quick filters' frosted glow.
    leafOn: {
      backgroundColor: 'rgba(123, 216, 143, 0.18)', borderColor: LEAF_GREEN, borderWidth: 1.5,
      shadowColor: '#3FA45B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 10,
    },
    chip: {
      height: CHIP_H,
      justifyContent: 'center',
      paddingHorizontal: 11,
      borderRadius: 15,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.cardAlt,
    },
    // Frosted, accent-tinted highlight rather than a solid fill.
    chipSelected: { backgroundColor: colors.accent + '33', borderColor: colors.neon },
    chipDim: { backgroundColor: 'transparent' },
    // Non-regional groups read as a different kind of chip (no pin on the globe).
    chipOther: { borderStyle: 'dashed' },
    chipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
    chipTextSelected: { color: colors.textLight },
  });
