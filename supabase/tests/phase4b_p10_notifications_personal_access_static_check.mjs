import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../migrations/042_notifications_personal_access.sql', import.meta.url), 'utf8');

assert.match(sql, /041_report_mapped_recipient_sign/);
assert.match(sql, /public\.notifications/);
assert.match(sql, /alter table public\.notifications enable row level security/i);
assert.match(sql, /grant select on table public\.notifications to authenticated/i);
assert.match(sql, /create policy notifications_read_own/i);
assert.match(sql, /recipient_user_id\s*=\s*auth\.uid\(\)/i);
assert.match(sql, /revoke all privileges on table public\.notifications from public, anon, authenticated/i);
assert.match(sql, /revoke insert, update, delete[\s\S]*from authenticated/i);
assert.match(sql, /revoke insert, update, delete[\s\S]*from anon/i);
assert.doesNotMatch(sql, /grant\s+(?:all|insert|update|delete)/i);
assert.doesNotMatch(sql, /create or replace function public\.(send_report|sign_report|return_report)/i);
assert.doesNotMatch(sql, /api\/notifications|notificationController|src\//i);
assert.doesNotMatch(sql, /organization|role_broadcast|governance/i);

console.log('phase4b_p10_notifications_personal_access_static_check: PASS');
