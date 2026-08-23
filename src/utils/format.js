/**
 * Joins non-empty parts with " • ", dropping any that are falsy (e.g. a
 * spot with no specific cuisine type, or no recorded price) instead of
 * leaving a stray/empty bullet in the middle of the line.
 */
export function joinParts(parts) {
  return parts.filter(Boolean).join(' • ');
}
