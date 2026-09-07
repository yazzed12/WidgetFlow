import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const check = (name, condition) => { if (!condition) throw new Error(`FAIL: ${name}`); console.log(`PASS: ${name}`); };
const unchanged = {
  '017_edge_function_service_reads.sql':'d9643a7f157bd5abc98b49adbc2fa6fa3d759348b701e798b6c1fd93df00090f',
  '018_configuration_read_access.sql':'7a385685587eeafa0d2a9eb05c45e17ba48ae1a8709be4f13dcee41262ba134e',
  '019_admin_configuration_domain_operations.sql':'7adbd7303a36c2af30c010fa2f1579677e50db87cf550f35a01b307eb5bc739a',
  '020_configuration_operational_access.sql':'11115cba9721f6d5e5e6bd4571ef0602a70598c6b1001938fee7fbc5b0d48ad6',
};
check('migrations 017-020 unchanged', Object.entries(unchanged).every(([file, hash]) => createHash('sha256').update(read(`supabase/migrations/${file}`)).digest('hex') === hash));
const sql = read('supabase/migrations/021_admin_standard_pack_domain_operations.sql');
const verify = read('supabase/migrations/021_admin_standard_pack_domain_operations_verify.sql');
check('021 has dependency guard and ledger', sql.includes("020_configuration_operational_access") && sql.includes("021_admin_standard_pack_domain_operations"));
check('version metadata is additive', sql.includes('name_snapshot') && sql.includes('category_id_snapshot'));
check('immutability guards are enabled', sql.includes('standard_pack_versions_immutable_guard') && sql.includes('standard_pack_items_immutable_guard') && sql.includes('PACK_VERSION_IMMUTABLE'));
check('all Pack RPCs require protected Admin', ['admin_create_standard_pack','admin_save_standard_pack_draft','admin_create_standard_pack_version','admin_publish_standard_pack','admin_set_standard_pack_status'].every((name) => {
  const start = sql.indexOf(`function public.${name}`); return start >= 0 && sql.slice(start, sql.indexOf('end $function$', start)).includes('private.current_user_is_protected_admin()');
}));
check('payload validation is server-side', sql.includes('PACK_INVALID_PAYLOAD') && sql.includes("sourceType") && sql.includes("configuration"));
check('version labels are server-generated', sql.includes("return 'v1.' || v_minor::text") && sql.includes("values (v_pack.id, 'v1.0'"));
check('published versions are superseded atomically', sql.includes("set status = 'superseded'") && sql.includes("set status = 'published'"));
check('status transitions enforce published history', sql.includes('PACK_PUBLISHED_VERSION_NOT_FOUND') && sql.includes('PACK_ALREADY_ARCHIVED'));
check('no hard-delete Pack RPC exists', !/admin_delete_standard_pack|delete_standard_pack/i.test(sql));
check('all Pack RPC execute grants are explicit', ['admin_create_standard_pack','admin_save_standard_pack_draft','admin_create_standard_pack_version','admin_publish_standard_pack','admin_set_standard_pack_status'].every((name) => sql.includes(`grant execute on function public.${name}`) && sql.includes(`revoke all on function public.${name}`)));
check('direct Pack writes remain revoked', /revoke insert, update, delete[\s\S]+standard_pack_items[\s\S]+from anon, authenticated/i.test(sql));
check('no broad Pack policies', !/using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i.test(sql));
check('verification is read-only', !/^\s*(insert|update|delete|alter|drop|create)\s+/im.test(verify));
const repo = read('src/features/admin/repositories/adminMutationRepository.ts');
const service = read('src/features/admin/services/adminService.ts');
const page = read('src/components/admin/AdminPackManagement.tsx');
const canvas = read('src/components/template-builder/adminPackCanvas.ts');
check('Pack CRUD uses RPC repository methods', repo.includes('admin_create_standard_pack') && repo.includes('admin_save_standard_pack_draft') && repo.includes('admin_publish_standard_pack') && repo.includes('admin_set_standard_pack_status'));
check('Admin service exposes lifecycle methods', ['createPack','savePackDraft','createPackVersion','publishPack','disablePack','enablePack','archivePack'].every((name) => service.includes(`${name}:`)));
check('read-only limitation removed', !page.includes('Pack publishing is not yet migrated') && page.includes('New Pack'));
check('all Pack statuses are explicit', page.includes('Archived') && page.includes('Draft') && page.includes('Published') && page.includes('Disabled'));
check('archived Packs are not mapped to Disabled', read('src/features/admin/repositories/adminReadRepository.ts').includes("pack.status === 'archived' ? 'Archived'"));
check('Admin Pack Builder wiring exists', page.includes('TemplateBuilder') && page.includes('mode="admin-pack"') && page.includes('onSaveAdminPack'));
check('builder restores and saves metadata', canvas.includes('description: pack?.description') && canvas.includes('categoryId: pack?.categoryId') && canvas.includes('categoryId: template.categoryId'));
check('detached insertion remains cloned', canvas.includes('generateStableFieldKey') && canvas.includes('id: `comp-${stamp}-') && canvas.includes('id: `sec-${stamp}-'));
check('operational repository remains published-only', read('src/features/configuration/repositories/configurationRepository.ts').includes("eq('status', 'published')") && read('src/features/configuration/repositories/configurationRepository.ts').includes("pack.status === 'published'"));
check('studio.packs preview exists', read('src/components/admin/AdminStudioConfig.tsx').includes("key: 'studio.packs'"));
check('no Pack Express endpoint introduced', !page.includes('apiService') && !repo.includes('/api/'));
check('no service secret in frontend', !`${repo}${service}${page}`.match(/service[_-]?role/i));
console.log('Phase 3C.1 static checks passed.');
