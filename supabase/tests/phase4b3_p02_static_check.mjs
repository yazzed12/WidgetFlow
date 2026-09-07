import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../migrations/034_report_recipient_actions.sql', import.meta.url), 'utf8');
const signHotfix = fs.readFileSync(new URL('../migrations/036_report_sign_runtime_hotfix.sql', import.meta.url), 'utf8');
const context = fs.readFileSync(new URL('../../src/context/AppContext.tsx', import.meta.url), 'utf8');
const repository = fs.readFileSync(new URL('../../src/features/reports/reportRepository.ts', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../../src/components/reports/ReportViewModal.tsx', import.meta.url), 'utf8');

for (const token of ['return_report', 'sign_report', 'REPORT_ALREADY_PARTIALLY_SIGNED', 'REPORT_FULLY_SIGNED', 'locked_at', 'report_assignment_id', 'set search_path = \'\'']) {
  assert.ok(migration.includes(token), `034 contains ${token}`);
}
assert.match(migration, /assignment_row\.recipient_user_id <> actor\.user_id/);
assert.match(signHotfix, /gen_random_uuid\(\)/);
assert.doesNotMatch(signHotfix, /gen_random_bytes/);
assert.match(signHotfix, /revoke all[\s\S]*public\.sign_report[\s\S]*authenticated/);
assert.match(repository, /rpc\('return_report'/);
assert.match(repository, /rpc\('sign_report'/);
assert.match(context, /reportService\.returnReport/);
assert.match(context, /reportService\.signReport/);
assert.match(view, /assignment\.assignmentStatus === 'pending'/);
console.log('phase4b3 P0.2 static checks passed');
