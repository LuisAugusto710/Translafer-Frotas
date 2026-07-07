/**
 * Text normalization utilities.
 * Applies Title Case + whitespace cleanup to all user-entered text before DB persistence.
 * - Preserves accented characters (á, é, ç, ã, õ, etc.)
 * - Capitalizes after hyphens (e.g. "porto-alegre" → "Porto-Alegre")
 * - Collapses consecutive spaces, trims leading/trailing whitespace
 */

function capitalizeSegment(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Convert a string to Title Case with whitespace cleanup.
 * Returns "" for null/undefined/empty.
 */
export function toTitleCase(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned
    .split(" ")
    .map(part => part.split("-").map(capitalizeSegment).join("-"))
    .join(" ");
}

/**
 * Same as toTitleCase but returns null for null/undefined/blank inputs.
 * Use for nullable DB columns.
 */
export function toTitleCaseOrNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .map(part => part.split("-").map(capitalizeSegment).join("-"))
    .join(" ");
}

/**
 * Normalize a license plate: uppercase + trim + collapse spaces.
 */
export function normalizePlate(value: string | null | undefined): string {
  if (value == null) return "";
  return value.trim().toUpperCase().replace(/\s+/g, "");
}
