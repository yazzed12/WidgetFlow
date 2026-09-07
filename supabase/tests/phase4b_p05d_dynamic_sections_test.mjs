import assert from 'node:assert/strict';

const source = await import('../../src/shared/signatureResolver.ts');
const snapshot = { dynamicSections: [{ id: 'section-1', title: 'Financials', components: [
  { id: 'uuid-1', field_key: 'revenue', field_type: 'number', is_required: true, label: 'Revenue' },
  { id: 'uuid-2', field_key: 'variance', field_type: 'textarea', label: 'Variance' },
] }] };
const normalized = source.normalizeReportTemplateSnapshot(snapshot);
assert.equal(normalized.components.length, 2);
assert.deepEqual(normalized.components.map((field) => field.key), ['revenue', 'variance']);
assert.equal(normalized.components[0].type, 'number');
assert.equal(normalized.components[0].required, true);
assert.equal(normalized.dynamicSections[0].components[0].key, 'revenue');
console.log('phase4b P0.5D dynamicSections test passed');
