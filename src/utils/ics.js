import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Escapes text per the iCalendar spec (RFC 5545) - commas, semicolons, and
// backslashes need escaping, and a literal newline becomes the two-
// character sequence \n rather than a real line break (a real line break
// would start a NEW property line, corrupting the file).
function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// UTC, no punctuation, per RFC 5545's DATE-TIME format (e.g. 20260814T190000Z).
function formatIcsDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Matches buildCalendarLink's own default in ScheduleMealModal.js (the
// Google Calendar web-link version of "add to calendar") - kept the same
// so both paths propose the same event length.
const DEFAULT_DURATION_MS = 90 * 60 * 1000;

/**
 * Builds a standards-compliant .ics file's text content for one spot + time.
 * `participantNames` (both players' display names, whichever are set - a
 * blank/never-set name is just omitted) get folded into the description so
 * the calendar event actually says who it's with, not just where (user
 * request).
 */
export function buildIcsContent(spot, proposedTimeIso, participantNames = []) {
  const start = new Date(proposedTimeIso);
  const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  const now = new Date();
  const uid = `${spot.id || Math.random().toString(36).slice(2)}-${start.getTime()}@nomnom.app`;
  const location = spot.address || (spot.lat != null && spot.lng != null ? `${spot.lat},${spot.lng}` : '');
  const names = participantNames.filter(Boolean);
  const withNames = names.length ? ` with ${names.join(' & ')}` : '';

  // CRLF line endings are required by RFC 5545 - some calendar apps
  // (notably some Android versions) are strict about this and silently
  // fail to parse a file with plain \n endings.
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nomnom//Feast with Friends//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(`Nomnom: ${spot.name}`)}`,
    `DESCRIPTION:${escapeIcsText(`Picked together on Nomnom: ${spot.name}${withNames}`)}`,
    location ? `LOCATION:${escapeIcsText(location)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

/**
 * Writes a .ics file to the cache directory and hands it to the OS share
 * sheet - both iOS (Apple Calendar) and Android (Google Calendar or
 * whatever's set as default) recognize .ics natively and offer to add the
 * event directly. Deliberately not expo-calendar (which writes straight
 * into the native calendar with no share-sheet step, but needs verifying
 * against Expo Go - this app has stayed Expo-Go-compatible on purpose so
 * far, see CoinSpinner.js's Animated-not-Reanimated choice for the same
 * reasoning); both expo-file-system and expo-sharing ARE confirmed
 * Expo-Go-safe, so this is the definitely-works-today option on both
 * platforms (user request: "this needs to work on iPhones and Androids").
 */
export async function shareIcsForSpot(spot, proposedTimeIso, participantNames = []) {
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('SHARING_UNAVAILABLE');
  }
  const content = buildIcsContent(spot, proposedTimeIso, participantNames);
  const safeName = (spot.name || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const file = new File(Paths.cache, `nomnom-${safeName}-${Date.now()}.ics`);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/calendar',
    UTI: 'com.apple.ical.ics',
    dialogTitle: `Add ${spot.name} to your calendar`,
  });
}
