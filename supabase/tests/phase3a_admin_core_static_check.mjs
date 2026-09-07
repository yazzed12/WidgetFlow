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

const expectedHashes = {
  '001_foundation.sql': '3c1a6d23572133b7ccdd9adf3de2afcab4cf4ecd547a80841d3e6973ae095ea4',
  '002_identity_roles_permissions.sql': '6861861e693dfd3320e3e2aa9251fab7a933433c299e2497d476b2011dfbf0c5',
  '003_configuration_governance.sql': '6e1c2f272c94028dba8451436e6d159f1381fc70d614dd7109897aee8d6550d9',
  '004_templates.sql': 'b75220868903373d1396cd629517f4b321d9d67f37750cb4725030277f98e103',
  '005_reports_signatures.sql': 'e300b1d08311655b0938f819511a69a8e79b377f047ed476aadc8aae7c6c00e4',
  '006_reusable_content.sql': 'a3ebddc9251416d09272dd5149c91fbf2bb3a98c24e2e32b190b3c41152d8c35',
  '007_workflows.sql': '709c6f1fe183b2ffc0f6b40202dcf83fa442952e4e5b0b5d911c558af9fe40d9',
  '008_notifications_assets_audit.sql': 'b26a3287f2b00e6e6bd81a09867c1f4fb30b35f08544ee43487f1f35611f7422',
  '009_security_baseline.sql': 'fa09c3a6653a615a48c7568e942f04cbb342dc069885c309747cc3d5ef8d1b70',
  '010_authz_principal_rls.sql': '4ecaa1021dc63e4414c17bd9b9ad968f909221913a2ba52fffd7785fafd7c5dd',
  '011_admin_domain_security.sql': '4e4b9c6fcbb1bb8f7bf8da9613bade85ee27cd79b78921b76453dd1688228fb5',
  '012_auth_audit_security.sql': '10f3d5f6b85676a27fbe9f467d5fd409b0fa77ba252ccb9173801b4cbc46c04d',
  '013_profile_codes.sql': 'c2c4747245d2bac4625a2f2b82521ac80fbb08aa67f2e9970506352cd5073458',
};
check('migrations 001-013 unchanged', Object.entries(expectedHashes).every(([file, expected]) =>
  createHash('sha256').update(read(`supabase/migrations/${file}`)).digest('hex') === expected));

const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql') && !name.endsWith('_verify.sql'));
check('new migration IDs unique', new Set(migrations.map((name) => name.match(/^\d+[a-z]?/)?.[0] ?? name)).size === migrations.length);
const phaseSql = ['014_admin_core_read_access.sql', '015_admin_core_domain_operations.sql', '016_admin_governance_dependency_guards.sql']
  .map((name) => read(`supabase/migrations/${name}`)).join('\n');
check('no broad USING true', !/using\s*\(\s*true\s*\)/i.test(phaseSql));
check('no anon policies', !/create\s+policy[\s\S]{0,180}\bto\s+anon\b/i.test(phaseSql));
check('no authenticated identity table writes', /revoke insert, update, delete[\s\S]+public\.profiles[\s\S]+from anon, authenticated/i.test(phaseSql));

const components = Object.fromEntries(['AdminOverview', 'AdminUsersAccess', 'AdminRolesPermissions', 'AdminCategories', 'AdminAuditLog', 'AdminPackManagement']
  .map((name) => [name, read(`src/components/admin/${name}.tsx`)]));
check('overview has no legacy endpoint', !components.AdminOverview.includes('apiService') && components.AdminOverview.includes('adminService.overview'));
check('users has no legacy endpoint', !components.AdminUsersAccess.includes('apiService') && components.AdminUsersAccess.includes('adminService.users'));
check('roles has no legacy endpoint', !components.AdminRolesPermissions.includes('apiService') && components.AdminRolesPermissions.includes('adminService.roleCatalog'));
check('categories has no legacy endpoint', !components.AdminCategories.includes('apiService') && components.AdminCategories.includes('adminService.categories'));
check('audit has no legacy endpoint', !components.AdminAuditLog.includes('apiService') && components.AdminAuditLog.includes('adminService.audit'));
check('packs has no legacy endpoint', !components.AdminPackManagement.includes('apiService') && components.AdminPackManagement.includes('adminService.packs'));
const featureSource = Object.values(components).join('\n') + read('src/features/admin/repositories/adminMutationRepository.ts');
check('no demo identity header', !featureSource.includes('X-Demo-User-Id'));
check('no default Employee fallback', !featureSource.includes("role: 'Employee'"));
check('profile code is visible identity', components.AdminUsersAccess.includes('user.profileCode'));
check('UUID is not rendered as user ID', !/<(?:td|span|div)[^>]*>\s*\{user\.id\}/.test(components.AdminUsersAccess));
check('normal user role list excludes Admin', components.AdminUsersAccess.includes("role.key !== 'admin'"));
check('dedicated Admin creation flow', components.AdminUsersAccess.includes('adminService.createAdmin'));

const mutations = read('src/features/admin/repositories/adminMutationRepository.ts');
check('status uses Edge Function', mutations.includes("invoke('admin-set-user-status'"));
check('role change uses Edge Function', mutations.includes("invoke('admin-change-user-role'"));
check('password reset uses Edge Function', mutations.includes("invoke('admin-reset-password'"));
check('permission update uses one trusted RPC', mutations.includes("rpc('admin_update_role'"));
check('protected Admin role is not editable', components.AdminRolesPermissions.includes("isProtectedAdmin ?"));
check('last Admin protection remains', read('supabase/migrations/011_admin_domain_security.sql').includes('LAST_ACTIVE_ADMIN'));
check('Specific User dependency guard exists', phaseSql.includes('GOVERNANCE_REVIEWER_DEPENDENCY'));
check('Role Queue empty guard exists', phaseSql.includes('GOVERNANCE_ROLE_QUEUE_EMPTY'));
check('queue eligibility requires view and approve', phaseSql.includes("template_approvals.view") && phaseSql.includes("template_approvals.approve"));
check('category mutations are audited', phaseSql.includes("'CATEGORY_CREATED'") && phaseSql.includes("'CATEGORY_UPDATED'"));
check('packs remain Admin-owned through service boundary', components.AdminPackManagement.includes('adminService.packs') && !components.AdminPackManagement.includes('apiService'));

const frontendFiles = readdirSync(resolve(root, 'src/features/admin/repositories')).map((file) => read(`src/features/admin/repositories/${file}`)).join('\n');
check('no service secret in frontend', !/service[_-]?role/i.test(frontendFiles));
check('overview RPC has no actor argument', /function public\.admin_overview_summary\(\)/.test(phaseSql));
check('SECURITY DEFINER functions use empty search path', !/security definer\s+(?!set search_path = '')/i.test(phaseSql));
check('browser repository performs no direct writes', !/\.insert\(|\.update\(|\.delete\(/.test(frontendFiles));
check('historical tables are never rewritten', !/update public\.(user_role_history|admin_audit_events|application_auth_events)/i.test(phaseSql));

console.log(`Phase 3A static checks passed: ${checks.length}`);
checks.forEach((name, index) => console.log(`${index + 1}. ${name}`));
