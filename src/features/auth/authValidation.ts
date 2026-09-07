export function validateEmail(value: string): string | null {
  const normalized = value.trim();
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? null
    : 'Enter a valid email address.';
}
