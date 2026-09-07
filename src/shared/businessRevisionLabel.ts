/** Converts internal semantic versions to the business-facing revision badge. */
export function getBusinessRevisionLabel(version: string | number | null | undefined): string {
  if (version === null || version === undefined) return '';
  const match = String(version).trim().match(/^v?1\.(\d+)$/i);
  if (!match) return '';
  const revision = Number(match[1]);
  return Number.isFinite(revision) && revision > 0 ? `v${revision}` : '';
}

