/**
 * Normalizes a template name for logical identity comparison.
 * Trims leading/trailing whitespace, converts to lowercase, and collapses internal spaces.
 * Example: " Purchase   Request " -> "purchase request"
 */
export function normalizeTemplateIdentityName(name: string): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Determines if two template definitions share the same logical identity (same category & same normalized name).
 */
export function isSameLogicalTemplateIdentity(
  catA?: string | null,
  nameA?: string | null,
  catB?: string | null,
  nameB?: string | null
): boolean {
  if (!catA || !catB || !nameA || !nameB) return false;
  if (catA !== catB) return false;
  return normalizeTemplateIdentityName(nameA) === normalizeTemplateIdentityName(nameB);
}
