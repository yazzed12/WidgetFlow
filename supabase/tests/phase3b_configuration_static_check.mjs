import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const checks = [];
const check = (name, condition) => {
  if (!condition) throw new Error(`FAIL: ${name}`);
  checks.push(name);
};
const hashes = {
  '001_foundation.sql':'3c1a6d23572133b7ccdd9adf3de2afcab4cf4ecd547a80841d3e6973ae095ea4',
  '002_identity_roles_permissions.sql':'6861861e693dfd3320e3e2aa9251fab7a933433c299e2497d476b2011dfbf0c5',
  '003_configuration_governance.sql':'6e1c2f272c94028dba8451436e6d159f1381fc70d614dd7109897aee8d6550d9',
  '004_templates.sql':'b75220868903373d1396cd629517f4b321d9d67f37750cb4725030277f98e103',
  '005_reports_signatures.sql':'e300b1d08311655b0938f819511a69a8e79b377f047ed476aadc8aae7c6c00e4',
  '006_reusable_content.sql':'a3ebddc9251416d09272dd5149c91fbf2bb3a98c24e2e32b190b3c41152d8c35',
  '007_workflows.sql':'709c6f1fe183b2ffc0f6b40202dcf83fa442952e4e5b0b5d911c558af9fe40d9',
  '008_notifications_assets_audit.sql':'b26a3287f2b00e6e6bd81a09867c1f4fb30b35f08544ee43487f1f35611f7422',
  '009_security_baseline.sql':'fa09c3a6653a615a48c7568e942f04cbb342dc069885c309747cc3d5ef8d1b70',
  '010_authz_principal_rls.sql':'4ecaa1021dc63e4414c17bd9b9ad968f909221913a2ba52fffd7785fafd7c5dd',
  '011_admin_domain_security.sql':'4e4b9c6fcbb1bb8f7bf8da9613bade85ee27cd79b78921b76453dd1688228fb5',
  '012_auth_audit_security.sql':'10f3d5f6b85676a27fbe9f467d5fd409b0fa77ba252ccb9173801b4cbc46c04d',
  '013_profile_codes.sql':'c2c4747245d2bac4625a2f2b82521ac80fbb08aa67f2e9970506352cd5073458',
  '014_admin_core_read_access.sql':'afa4eeff01879640eeac4023cc513c1736ed648025a946389234049050f4c8c7',
  '015_admin_core_domain_operations.sql':'aa840a8d7971b71afe8ab15c3ac0e8ac9d7bfdb12debbc5612e9d114067cb13b',
  '016_admin_governance_dependency_guards.sql':'0c3f1b9e6dbfe5bbbd58942678e1e91a31bf4ae653d5d12689837f7ae9b5f1e0',
};
check('migrations 001-016 unchanged', Object.entries(hashes).every(([file, hash]) =>
  createHash('sha256').update(read(`supabase/migrations/${file}`)).digest('hex') === hash));

const m17 = read('supabase/migrations/017_edge_function_service_reads.sql');
const m18 = read('supabase/migrations/018_configuration_read_access.sql');
const m19 = read('supabase/migrations/019_admin_configuration_domain_operations.sql');
const m20 = read('supabase/migrations/020_configuration_operational_access.sql');
const phaseSql = [m18, m19, m20].join('\n');
const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql') && !file.endsWith('_verify.sql'));
check('local migration 017 exists with read-only service fix', /grant select on table public\.roles, public\.profiles to service_role/i.test(m17.replace(/\s+/g, ' ')) && !/grant (insert|update|delete|all).*service_role/i.test(m17));
check('migration IDs are unique', new Set(migrations.map((file) => file.match(/^\d+[a-z]?/)?.[0] ?? file)).size === migrations.length);
check('no broad USING true', !/using\s*\(\s*true\s*\)/i.test(phaseSql));
check('no anon policies', !/create\s+policy[\s\S]{0,220}\bto\s+anon\b/i.test(phaseSql));
check('authenticated direct config writes are revoked', /revoke insert, update, delete[\s\S]+public\.feature_settings[\s\S]+from anon, authenticated/i.test(m19));

const app = read('src/context/AppContext.tsx');
check('AppContext does not call getUsers', !app.includes('getUsers('));
check('AppContext categories use Supabase template service', app.includes('templateService.getCategories()') && !app.includes('apiService.getCategories('));
check('AppContext startup loads templates through Supabase', app.includes('void refreshTemplates()') && !app.includes('apiService.getTemplates('));
check('AppContext startup does not call getReports', !/useEffect[\s\S]{0,900}getReports\(/.test(app));
check('AppContext startup does not call getNotifications', !/useEffect[\s\S]{0,900}getNotifications\(/.test(app));

const system = read('src/context/SystemConfigContext.tsx');
const features = read('src/components/admin/AdminFeatureManagement.tsx');
const elements = read('src/components/admin/AdminElementManagement.tsx');
const adminContent = read('src/components/admin/AdminContentLibraryManagement.tsx');
const settings = read('src/components/admin/AdminSystemSettings.tsx');
const packs = read('src/components/template-builder/PacksPanel.tsx');
const content = read('src/components/template-builder/ContentLibraryPanel.tsx');
const builder = read('src/components/template-builder/TemplateBuilder.tsx');
const api = read('src/services/apiService.ts');
check('SystemConfigContext uses Supabase configuration service', system.includes('configurationService.effectiveConfig') && !system.includes('apiService'));
check('Feature Management uses configuration repository boundary', features.includes('configurationService.features') && !features.includes('apiService'));
check('Element Management uses configuration repository boundary', elements.includes('configurationService.elements') && !elements.includes('apiService'));
check('Admin Content Library uses configuration boundary', adminContent.includes('configurationService.contentLibrary') && !adminContent.includes('apiService'));
check('Governance routing uses configuration boundary', settings.includes('configurationService.governance') && !settings.includes('apiService'));
check('PacksPanel uses configuration boundary', packs.includes('configurationService.packs') && !packs.includes('apiService'));
check('ContentLibraryPanel uses configuration boundary', content.includes('configurationService.operationalContentLibrary') && !content.includes('apiService'));
check('legacy content packs are explicitly non-runtime', !api.includes('/api/content-packs') && builder.includes('Personal Pack changes are unavailable'));

const frontendCutover = [app, system, features, elements, adminContent, settings, packs, content, builder,
  read('src/features/configuration/repositories/configurationRepository.ts')].join('\n');
check('no demo identity header in cutover', !frontendCutover.includes('X-Demo-User-Id'));
check('no DEMO_USERS authority in cutover', !frontendCutover.includes('DEMO_USERS'));
check('no default Employee fallback in cutover', !/(role|governanceLevel)\s*[:=]\s*[^\n]*\|\|\s*['"]Employee['"]/.test(frontendCutover));
check('no service secret in React configuration code', !/service[_-]?role/i.test(frontendCutover));
check('one shared Supabase browser client', !read('src/features/configuration/repositories/configurationRepository.ts').includes('createClient('));

const adminFunctions = ['admin_set_feature_enabled','admin_set_element_enabled','admin_update_system_settings',
  'admin_create_content_library_item','admin_update_content_library_item','admin_set_content_library_item_enabled',
  'admin_update_governance_routes'];
check('all Admin configuration RPCs check protected Admin', adminFunctions.every((name) => {
  const start = m19.indexOf(`function public.${name}`);
  const end = m19.indexOf('end $function$', start);
  return start >= 0 && m19.slice(start, end).includes('private.current_user_is_protected_admin()');
}));
check('Specific User validation checks active matching profile', /p_strategy = 'SPECIFIC_USER'[\s\S]+p\.id = p_user_id[\s\S]+p\.role_id = p_role_id[\s\S]+p\.status = 'Active'/.test(m19));
check('Role Queue requires view and approve permissions', m19.includes("template_approvals.view") && m19.includes("template_approvals.approve") && m19.includes("p_strategy = 'ROLE_QUEUE'"));
check('governance mutation does not rewrite historical assignments', !/update public\.(templates|template_approval|template_versions|admin_audit_events)/i.test(m19));
check('feature changes are audited', m19.includes("'FEATURE_ENABLED'") && m19.includes("'FEATURE_DISABLED'"));
check('element changes are audited', m19.includes("'ELEMENT_ENABLED'") && m19.includes("'ELEMENT_DISABLED'"));
check('content changes are audited', m19.includes("'CONTENT_ITEM_CREATED'") && m19.includes("'CONTENT_ITEM_UPDATED'") && m19.includes("'CONTENT_ITEM_DISABLED'"));
check('governance changes are audited', m19.includes("'GOVERNANCE_ROUTES_UPDATED'"));
check('operational content requires enabled row', /content_library_items_select_operational[\s\S]+is_enabled/.test(m20));
check('operational Packs require published status', /standard_packs_select_operational[\s\S]+status = 'published'/.test(m20) && /standard_pack_versions_select_operational[\s\S]+status = 'published'/.test(m20));
check('Admin can read disabled configuration and content', ['feature_settings','element_settings','system_settings','governance_routes','content_library_items'].every((table) => m18.includes(`${table}_select_protected_admin`)));
check('effective configuration derives caller without actor input', /function public\.current_effective_system_config\(\)/.test(m20) && m20.includes('auth.uid()'));
check('RPC functions use empty search path', !/security definer\s+(?!set search_path = '')/i.test(`${m19}\n${m20}`));
check('public and anon RPC execute are revoked', adminFunctions.concat('current_effective_system_config').every((name) => new RegExp(`revoke all on function public\\.${name}`).test(`${m19}\n${m20}`)));
check('browser repository contains no direct writes', !/\.(insert|update|delete)\(/.test(read('src/features/configuration/repositories/configurationRepository.ts')));
check('profile code is shown in reviewer selectors', settings.includes('u.profileCode'));
check('normal Template Studio mode contract remains explicit', builder.includes("mode = 'template'") && builder.includes("mode?: 'template' | 'admin-pack'"));
check('production build and typecheck command remains configured', read('package.json').includes('"build": "tsc -b && vite build"'));

console.log(`Phase 3B static checks passed: ${checks.length}`);
checks.forEach((name, index) => console.log(`${index + 1}. ${name}`));
