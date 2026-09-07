import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const checks = [];
const migration = read('supabase/migrations/023_template_domain_operations.sql');
const required = ['save_template_draft','submit_template_for_approval','claim_template_review','approve_template','reject_template','create_template_revision','add_template_comment'];
for (const name of required) checks.push([`RPC ${name}`, migration.includes(`function public.${name}`)]);
checks.push(['fixed search path', migration.includes('set search_path = \'\'')]);
checks.push(['security definer', migration.includes('security definer')]);
checks.push(['RLS template reads', migration.includes('create policy templates_read_approved')]);
checks.push(['immutability guard', migration.includes('templates_immutable_guard')]);
const forbidden = ['getTemplates','getTemplateById','getPendingApprovals','saveTemplateDraft','submitTemplate','claimTemplateReview','approveTemplate','rejectTemplate','getTemplateComments','addTemplateComment','createTemplateVersion'];
for (const p of ['src/context/AppContext.tsx','src/components/template-builder/TemplateBuilder.tsx']) {
  const source = read(p); for (const method of forbidden) checks.push([`${p} no apiService.${method}`, !source.includes(`apiService.${method}`)]);
}
checks.push(['shared business revision helper', fs.existsSync(path.join(root,'src/shared/businessRevisionLabel.ts'))]);
let failed = 0; for (const [label, ok, extra] of checks) { const pass = ok && (extra === undefined || extra); console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`); if (!pass) failed++; }
if (failed) process.exit(1); console.log(`Phase 3D static check passed (${checks.length} checks)`);
