import fs from 'node:fs'; import assert from 'node:assert/strict';
const root = new URL('../../', import.meta.url).pathname;
const sql = fs.readFileSync(`${root}supabase/migrations/032_report_multi_recipient_send.sql`,'utf8');
const modal = fs.readFileSync(`${root}src/components/reports/SendReportModal.tsx`,'utf8');
const fill = fs.readFileSync(`${root}src/components/reports/FillReportModal.tsx`,'utf8');
const ctx = fs.readFileSync(`${root}src/context/AppContext.tsx`,'utf8');
const repo = fs.readFileSync(`${root}src/features/reports/reportRepository.ts`,'utf8');
assert.match(sql,/031_report_snapshot_shape_compatibility/); assert.match(sql,/list_report_recipient_directory/); assert.match(sql,/send_report/); assert.match(sql,/reports\.send/); assert.match(sql,/reports\.view_own/); assert.match(sql,/for update/); assert.match(sql,/status<>'completed'/); assert.match(sql,/p_recipient_user_ids/); assert.match(sql,/DUPLICATE_RECIPIENT/); assert.match(sql,/SELF_RECIPIENT_NOT_ALLOWED/); assert.match(sql,/INVALID_RECIPIENT/); assert.match(sql,/report_send_cycles/); assert.match(sql,/report_assignments/); assert.match(sql,/REPORT_SENT/); assert.match(sql,/REPORT_RECEIVED/); assert.doesNotMatch(sql,/alter\s+table\s+public\.reports[\s\S]*recipient.*array/i); assert.match(repo,/listRecipientDirectory/); assert.match(repo,/rpc\('send_report'/); assert.match(modal,/listRecipientDirectory/); assert.match(modal,/type="checkbox"/); assert.match(modal,/selectedRecipientIds/); assert.match(fill,/updateReportInstance\([^\n]+true/); assert.match(ctx,/reportService\.send/); assert.doesNotMatch(modal,/users\.filter/);
console.log('phase4b3 static checks passed');
