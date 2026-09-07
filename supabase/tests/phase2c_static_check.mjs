import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const migrationHashes = new Map([
  ['001_foundation.sql', '3c1a6d23572133b7ccdd9adf3de2afcab4cf4ecd547a80841d3e6973ae095ea4'],
  ['002_identity_roles_permissions.sql', '6861861e693dfd3320e3e2aa9251fab7a933433c299e2497d476b2011dfbf0c5'],
  ['003_configuration_governance.sql', '6e1c2f272c94028dba8451436e6d159f1381fc70d614dd7109897aee8d6550d9'],
  ['004_templates.sql', 'b75220868903373d1396cd629517f4b321d9d67f37750cb4725030277f98e103'],
  ['005_reports_signatures.sql', 'e300b1d08311655b0938f819511a69a8e79b377f047ed476aadc8aae7c6c00e4'],
  ['006_reusable_content.sql', 'a3ebddc9251416d09272dd5149c91fbf2bb3a98c24e2e32b190b3c41152d8c35'],
  ['007_workflows.sql', '709c6f1fe183b2ffc0f6b40202dcf83fa442952e4e5b0b5d911c558af9fe40d9'],
  ['008_notifications_assets_audit.sql', 'b26a3287f2b00e6e6bd81a09867c1f4fb30b35f08544ee43487f1f35611f7422'],
  ['009_security_baseline.sql', 'fa09c3a6653a615a48c7568e942f04cbb342dc069885c309747cc3d5ef8d1b70'],
  ['010_authz_principal_rls.sql', '4ecaa1021dc63e4414c17bd9b9ad968f909221913a2ba52fffd7785fafd7c5dd'],
  ['011_admin_domain_security.sql', '4e4b9c6fcbb1bb8f7bf8da9613bade85ee27cd79b78921b76453dd1688228fb5'],
  ['012_auth_audit_security.sql', '10f3d5f6b85676a27fbe9f467d5fd409b0fa77ba252ccb9173801b4cbc46c04d'],
]);

for (const [name, expectedHash] of migrationHashes) {
  const contents = fs.readFileSync(path.join(root, 'supabase/migrations', name));
  assert.equal(createHash('sha256').update(contents).digest('hex'), expectedHash, `${name} changed`);
}

const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations'));
assert.deepEqual(migrationFiles.filter((name) => /^013_/.test(name)), ['013_profile_codes.sql']);

const migration = read('supabase/migrations/013_profile_codes.sql');
const currentPrincipal = migration.match(/create function public\.current_principal\(\)[\s\S]*?revoke all on function public\.current_principal\(\)/i)?.[0] ?? '';
const authTypes = read('src/features/auth/authTypes.ts');
const authService = read('src/features/auth/authService.ts');
const edgeCreateUser = read('supabase/functions/admin-create-user/index.ts');
const edgeCreateAdmin = read('supabase/functions/admin-create-admin/index.ts');
const adminDomain = read('supabase/migrations/011_admin_domain_security.sql');
const frontendFiles = fs.readdirSync(path.join(root, 'src'), { recursive: true })
  .filter((entry) => typeof entry === 'string' && /\.(?:ts|tsx)$/.test(entry))
  .map((entry) => path.join(root, 'src', entry));
const frontendSource = frontendFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

assert.match(migration, /'013_profile_codes'[\s\S]*'Immutable business-facing profile codes with atomic monthly role-prefix allocation'/);
assert.match(migration, /add column profile_code text/i);
assert.match(migration, /profiles_profile_code_uq unique \(profile_code\)/i);
assert.match(migration, /alter column profile_code set not null/i);
assert.match(migration, /\^\[A-Z\]\{2\}-\[0-9\]\{3,\}-\[0-9\]\{4\}\$/);
assert.match(migration, /insert into private\.profile_code_counters as counters[\s\S]*on conflict \(prefix, period_key\)[\s\S]*last_value = counters\.last_value \+ 1[\s\S]*returning last_value/i);
assert.doesNotMatch(migration, /max\s*\([^)]*profile_code[^)]*\)\s*\+\s*1/i);
assert.doesNotMatch(migration, /count\s*\([^)]*\)\s*\+\s*1/i);
assert.match(migration, /when 'admin' then return 'AD'/i);
assert.match(migration, /when 'employee' then return 'EM'/i);
assert.match(migration, /when 'manager' then return 'MG'/i);
assert.match(migration, /when 'director' then return 'DR'/i);
assert.match(migration, /if v_role\.role_type = 'Custom' then[\s\S]*return 'CU'/i);
assert.match(migration, /PROFILE_CODE_SYSTEM_ROLE_UNKNOWN/);
assert.match(migration, /at time zone 'UTC'/i);
assert.match(migration, /before insert on public\.profiles[\s\S]*private\.assign_profile_code\(\)/i);
assert.match(migration, /PROFILE_CODE_MANAGED/);
assert.match(migration, /PROFILE_CODE_IMMUTABLE/);
assert.match(migration, /before update of profile_code on public\.profiles/i);
assert.match(migration, /revoke all privileges on table private\.profile_code_counters[\s\S]*public, anon, authenticated, service_role/i);
assert.match(currentPrincipal, /profile_code text/i);
assert.match(currentPrincipal, /p\.profile_code/i);
assert.match(currentPrincipal, /where p\.id = auth\.uid\(\)/i);
assert.match(currentPrincipal, /security definer[\s\S]*set search_path = ''/i);
assert.match(migration, /grant execute on function public\.current_principal\(\) to authenticated/i);
assert.doesNotMatch(migration, /grant execute on function private\.(?:profile_code_prefix|next_profile_code|assign_profile_code|protect_profile_code)/i);

assert.match(adminDomain, /update public\.profiles\s+set role_id = v_new_role\.id/i);
assert.match(adminDomain, /update public\.profiles\s+set status = p_status/i);
assert.doesNotMatch(adminDomain, /set\s+profile_code/i);
assert.match(authTypes, /profile_code: string/);
assert.match(authTypes, /profileCode: string/);
assert.match(authTypes, /profileCode: principal\.profileCode/);
assert.match(authService, /profileCode: value\.profile_code/);
assert.doesNotMatch(edgeCreateUser, /profileCode|profile_code|prefix|sequence/);
assert.doesNotMatch(edgeCreateAdmin, /profileCode|profile_code|prefix|sequence/);
assert.doesNotMatch(frontendSource, /VITE_SUPABASE_(?:SECRET|SERVICE_ROLE)|SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/);
assert.doesNotMatch(frontendSource, /localStorage[\s\S]{0,100}(?:profileCode|profile_code)/i);
for (const file of frontendFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /[`'"](?:AD|EM|MG|DR|CU)-\$\{/i, `client profile-code construction in ${file}`);
  assert.doesNotMatch(source, />\s*\{(?:currentUser|user|principal)\.id\}\s*</, `visible UUID in ${file}`);
}
assert.doesNotMatch(frontendSource, /generateProfileCode|nextProfileCode/i);
assert.doesNotMatch(frontendSource, /RoleSwitcher|isDemoIdentityMode/);

console.log('Phase 2C profile-code static checks passed.');
