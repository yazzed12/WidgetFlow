import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(new URL('../migrations/038_report_sender_signature_snapshot.sql', import.meta.url), 'utf8');

assert.match(migration, /create or replace function public\.send_report\(p_report_id uuid,p_recipient_user_ids uuid\[\],p_note text default null\)/);
assert.match(migration, /037_report_historical_template_version_read/);
assert.match(migration, /public\.template_versions/);
assert.match(migration, /schema_snapshot/);
assert.match(migration, /public\.signature_profiles/);
assert.match(migration, /public\.report_values/);
assert.match(migration, /SENDER_SIGNATURE_REQUIRED/);
assert.match(migration, /INVALID_SENDER_SIGNATURE_FIELD/);
assert.match(migration, /on conflict \(report_id, field_key\) do update/);
assert.match(migration, /signatureConfig.*signatureRole|signatureRole/);
assert.match(migration, /jsonb_array_elements/);
assert.match(migration, /jsonb_each/);
assert.doesNotMatch(migration, /insert into public\.report_signature_events/);

console.log('phase4b_p06a_sender_signature_static_check: PASS');
