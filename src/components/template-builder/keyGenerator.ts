import type { TemplateComponent, ReportTemplateField } from '../../types/index.js';

export function generateStableFieldKey(
  label: string,
  existingComponents: Array<TemplateComponent | ReportTemplateField> = []
): string {
  // 1. Basic snake_case conversion
  let baseKey = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, '') // remove special chars
    .replace(/\s+/g, '_'); // replace spaces with underscores

  if (!baseKey) {
    baseKey = 'field';
  }

  // 2. Extract existing keys
  const existingKeys = new Set(
    existingComponents.map((c) => (c.key || c.id || '').toLowerCase())
  );

  // 3. Collision resolution
  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }

  let counter = 2;
  while (existingKeys.has(`${baseKey}_${counter}`)) {
    counter++;
  }

  return `${baseKey}_${counter}`;
}

export function generateUniqueKey(
  proposedKey: string,
  existingKeys: Set<string>
): string {
  let baseKey = proposedKey
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_');
  if (!baseKey) baseKey = 'field';

  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }

  let counter = 2;
  while (existingKeys.has(`${baseKey}_${counter}`)) {
    counter++;
  }
  return `${baseKey}_${counter}`;
}
