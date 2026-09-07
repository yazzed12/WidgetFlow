import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../migrations/041_report_mapped_recipient_sign.sql', import.meta.url), 'utf8');

assert.match(sql, /040_report_signature_mapping_send/);
assert.match(sql, /create or replace function public\.sign_report/);
assert.match(sql, /public\.report_signature_assignments/);
assert.match(sql, /report_assignment_id = assignment_row\.id/);
assert.match(sql, /send_cycle_id = report_row\.current_send_cycle_id/);
assert.match(sql, /recipient_user_id = actor\.user_id/);
assert.match(sql, /public\.signature_profiles/);
assert.match(sql, /is_active = true/);
assert.match(sql, /public\.report_values/);
assert.match(sql, /mapping_row\.signature_field_key/);
assert.match(sql, /template_version_row\.schema_snapshot/);
assert.match(sql, /signature_role <> 'receiver'|signature_role <> 'receiver'/);
assert.match(sql, /public\.report_signature_events/);
assert.match(sql, /content_hash/);
assert.match(sql, /verification_id/);
assert.match(sql, /assignment_status = 'signed'/);
assert.match(sql, /total_mapped_signers/);
assert.match(sql, /signed_mapped_signers/);
assert.match(sql, /total_mapped_signers > 0/);
assert.match(sql, /REPORT_SIGNED/);
assert.match(sql, /REPORT_FULLY_SIGNED/);
assert.match(sql, /security definer/i);
assert.match(sql, /set search_path = ''/);
assert.match(sql, /grant execute on function public\.sign_report[\s\S]*to authenticated/);
assert.match(sql, /revoke all on function public\.sign_report[\s\S]*from public, anon, authenticated/);
assert.doesNotMatch(sql, /create or replace function public\.send_report/i);
assert.doesNotMatch(sql, /create or replace function public\.return_report/i);
assert.doesNotMatch(sql, /assignment_sequence/);
assert.doesNotMatch(sql, /first empty|first receiver|fifo/i);

console.log('phase4b_p09_mapped_recipient_sign_static_check: PASS');
