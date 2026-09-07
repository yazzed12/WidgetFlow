import fs from 'node:fs';
const read = (p) => fs.readFileSync(p, 'utf8');
const sql = read('supabase/migrations/028_report_multi_recipient_foundation.sql');
const verify = read('supabase/migrations/028_verify_report_multi_recipient_foundation.sql');
const m026 = read('supabase/migrations/026_Protected Admin Approved Template Read Access.sql');
const m027 = read('supabase/migrations/027_Operational Active Category Read Access.sql');
const checks = [
  ['026 local sync', m026.includes('026_protected_admin_template_read') && m026.includes('templates_read_approved')],
  ['027 local sync', m027.includes('027_operational_active_category_read') && m027.includes('categories_select_active_operational')],
  ['028 dependency guard', sql.includes("027_operational_active_category_read")],
  ['send cycles table', sql.includes('create table public.report_send_cycles')],
  ['assignments table', sql.includes('create table public.report_assignments')],
  ['dynamic recipients', sql.includes('unique (send_cycle_id, recipient_user_id)') && !sql.includes('recipient_ids')],
  ['cycle uniqueness', sql.includes('unique (report_id, cycle_number)')],
  ['cycle statuses', /'active'\s*,\s*'returned'\s*,\s*'rejected'\s*,\s*'finalized'\s*,\s*'cancelled'/.test(sql)],
  ['assignment statuses', /'pending'\s*,\s*'signed'\s*,\s*'returned'\s*,\s*'rejected'\s*,\s*'cancelled'/.test(sql)],
  ['current cycle linkage', sql.includes('add column current_send_cycle_id uuid')],
  ['signature linkage', sql.includes('add column send_cycle_id uuid') && sql.includes('add column report_assignment_id uuid')],
  ['comment audit notification linkage', sql.includes('alter table public.report_comments') && sql.includes('alter table public.report_audit_events') && sql.includes('alter table public.notifications')],
  ['RLS enabled', sql.includes('alter table public.report_send_cycles enable row level security') && sql.includes('alter table public.report_assignments enable row level security')],
  ['anonymous denied', /from\s+(public,\s*)?anon\s*,\s*authenticated/.test(sql)],
  ['direct writes denied', sql.includes('revoke insert, update, delete, truncate')],
  ['select grant only', /grant\s+select\s+on\s+table[\s\S]*public\.reports/.test(sql)],
  ['fixed search path', sql.includes("set search_path = ''")],
  ['no lifecycle RPCs', !sql.match(/create\s+function\s+public\.(create|save|send|return|reject|sign)_report/i)],
  ['read-only verification', !verify.replace(/--.*$/gm, '').match(/^\s*(insert|update|delete|alter|create|drop|grant|revoke)\b/im)],
];
let failed = 0; for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failed++; }
if (failed) process.exit(1); console.log(`Phase 4B.1 static check passed (${checks.length} checks)`);
