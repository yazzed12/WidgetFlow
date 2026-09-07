import fs from 'node:fs';
import assert from 'node:assert/strict';

const sql = fs.readFileSync(new URL('../migrations/040_report_signature_mapping_send.sql', import.meta.url), 'utf8');

assert.match(sql, /039_report_signature_assignment_foundation/);
assert.match(sql, /alter function public\.send_report\(uuid, uuid\[\], text\) set schema private/);
assert.match(sql, /send_report_038_legacy/);
assert.match(sql, /create or replace function public\.send_report\(/);
assert.match(sql, /p_signature_mappings jsonb default '\[\]'::jsonb/);
assert.match(sql, /public\.report_signature_assignments/);
assert.match(sql, /signature_role.*receiver|signature_role.*= 'receiver'/s);
assert.match(sql, /SIGNATURE_MAPPING_FIELD_NOT_RECEIVER/);
assert.match(sql, /field_key/);
assert.match(sql, /->> 'key'/);
assert.match(sql, /SENDER_SIGNATURE_REQUIRED/);
assert.match(sql, /private\.send_report_038_legacy/);
assert.match(sql, /public\.notifications/);
assert.match(sql, /private\.report_signature_assignments|report_signature_assignments/);
assert.match(sql, /private\.report_audit/);
assert.match(sql, /security definer/i);
assert.match(sql, /set search_path = ''/);
assert.doesNotMatch(sql, /create or replace function public\.sign_report/i);
assert.doesNotMatch(sql, /create or replace function public\.return_report/i);
assert.match(sql, /mapping_row ->> 'signatureFieldKey'/);

console.log('phase4b_p08_signature_mapping_send_static_check: PASS');
