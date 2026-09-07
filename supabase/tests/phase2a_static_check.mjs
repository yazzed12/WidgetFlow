import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(testsDirectory, '../..');
const migrationsDirectory = join(root, 'supabase/migrations');
const functionsDirectory = join(root, 'supabase/functions');

const immutableMigrationHashes = new Map([
  ['001_foundation.sql', '3c1a6d23572133b7ccdd9adf3de2afcab4cf4ecd547a80841d3e6973ae095ea4'],
  ['002_identity_roles_permissions.sql', '6861861e693dfd3320e3e2aa9251fab7a933433c299e2497d476b2011dfbf0c5'],
  ['003_configuration_governance.sql', '6e1c2f272c94028dba8451436e6d159f1381fc70d614dd7109897aee8d6550d9'],
  ['004_templates.sql', 'b75220868903373d1396cd629517f4b321d9d67f37750cb4725030277f98e103'],
  ['005_reports_signatures.sql', 'e300b1d08311655b0938f819511a69a8e79b377f047ed476aadc8aae7c6c00e4'],
  ['006_reusable_content.sql', 'a3ebddc9251416d09272dd5149c91fbf2bb3a98c24e2e32b190b3c41152d8c35'],
  ['007_workflows.sql', '709c6f1fe183b2ffc0f6b40202dcf83fa442952e4e5b0b5d911c558af9fe40d9'],
  ['008_notifications_assets_audit.sql', 'b26a3287f2b00e6e6bd81a09867c1f4fb30b35f08544ee43487f1f35611f7422'],
  ['009_security_baseline.sql', 'fa09c3a6653a615a48c7568e942f04cbb342dc069885c309747cc3d5ef8d1b70'],
]);

const phase2MigrationNames = [
  '010_authz_principal_rls.sql',
  '011_admin_domain_security.sql',
  '012_auth_audit_security.sql',
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

for (const [name, expected] of immutableMigrationHashes) {
  const contents = await readFile(join(migrationsDirectory, name));
  const actual = createHash('sha256').update(contents).digest('hex');
  assert.equal(actual, expected, `${name} changed after Phase 1`);
}

const phase2Migrations = await Promise.all(
  phase2MigrationNames.map(async (name) => [name, await readFile(join(migrationsDirectory, name), 'utf8')]),
);
const migrationText = phase2Migrations.map(([, text]) => text).join('\n');
const ledgerIds = [...migrationText.matchAll(/values\s*\(\s*'([^']+)'\s*,\s*'[^']+'\s*\)/gi)]
  .map((match) => match[1])
  .filter((id) => /^01[0-2]_/.test(id));
assert.equal(ledgerIds.length, 3, 'Each Phase 2A migration must write one ledger ID');
assert.equal(new Set(ledgerIds).size, ledgerIds.length, 'Phase 2A migration IDs must be unique');
assert.doesNotMatch(migrationText, /using\s*\(\s*true\s*\)/i, 'Permissive USING(true) policy found');
assert.doesNotMatch(
  migrationText,
  /grant\s+(?:insert|update|delete|truncate|references|trigger)[\s\S]{0,300}\b(?:anon|authenticated)\b/i,
  'Browser write grant found on authorization data',
);

for (const [name, text] of phase2Migrations) {
  for (const block of text.matchAll(/create\s+or\s+replace\s+function[\s\S]*?\$function\$;/gi)) {
    if (/security\s+definer/i.test(block[0])) {
      assert.match(block[0], /set\s+search_path\s*=\s*''/i, `${name}: SECURITY DEFINER lacks fixed search_path`);
    }
  }
}

for (const functionName of [
  'current_role_id', 'current_user_is_active', 'current_user_is_protected_admin',
  'current_user_has_permission', 'current_principal', 'is_protected_admin_user',
  'active_protected_admin_count', 'write_admin_audit', 'admin_create_profile_domain',
  'admin_create_admin_profile_domain', 'admin_set_profile_status_domain',
  'admin_change_profile_role_domain', 'admin_record_password_reset_domain',
  'admin_record_account_create_failure_domain',
]) {
  assert.match(migrationText, new RegExp(`revoke all on function (?:private|public)\\.${functionName}\\(`, 'i'),
    `${functionName}: PUBLIC execution was not explicitly revoked`);
}

assert.match(migrationText, /key\)\)\s*=\s*'admin'[\s\S]*is_protected/i, 'Protected Admin identity check missing');
assert.match(migrationText, /active_protected_admin_count\(\)\s*<=\s*1/i, 'Last-active-Admin guard missing');
assert.match(migrationText, /PROFILE_HARD_DELETE_FORBIDDEN/i, 'Profile hard-delete guard missing');
assert.match(migrationText, /user_role_history_append_only/i, 'Role history append-only guard missing');

const edgeFiles = (await walk(functionsDirectory)).filter((path) => path.endsWith('.ts'));
const edgeText = (await Promise.all(edgeFiles.map((path) => readFile(path, 'utf8')))).join('\n');
assert.match(edgeText, /auth\.getUser\(/, 'Edge Functions do not validate the caller with Supabase Auth');
assert.match(edgeText, /rpc\('current_principal'\)/, 'Edge Functions do not resolve the live caller principal');
assert.match(edgeText, /profile_status\s*!==\s*'Active'/, 'Live profile status check missing');
assert.match(edgeText, /role_protected/, 'Protected Admin role check missing');
assert.match(edgeText, /admin\.deleteUser\(/, 'Create-user Auth compensation missing');
assert.doesNotMatch(edgeText, /console\.(?:log|info|debug)\s*\([^)]*(?:password|token|authorization)/i,
  'Credential material may be logged');
assert.doesNotMatch(edgeText, /from\(['"]profiles['"]\)\s*\.delete\s*\(/i, 'Profile hard-delete operation found');

const ordinaryCreate = await readFile(join(functionsDirectory, 'admin-create-user/index.ts'), 'utf8');
assert.match(ordinaryCreate, /role\.is_protected/, 'Ordinary create-user lacks protected-role rejection');
assert.match(ordinaryCreate, /role\.key\.trim\(\)\.toLowerCase\(\)\s*===\s*'admin'/,
  'Ordinary create-user can assign the Admin role');

const newlyCreated = [
  ...phase2MigrationNames.map((name) => join(migrationsDirectory, name)),
  ...edgeFiles,
  join(root, 'supabase/manual/bootstrap_first_admin_TEMPLATE.sql'),
  join(root, 'supabase/verification/phase2a_verify.sql'),
  join(root, 'supabase/tests/phase2a_static_check.mjs'),
  join(root, 'docs/supabase/PHASE2A_RUNBOOK.md'),
  join(root, 'docs/supabase/PHASE2A_SECURITY_MODEL.md'),
];
const forbiddenRuntimeIdentities = [
  'Ah' + 'med', 'Sa' + 'rah', 'Om' + 'ar', 'Li' + 'na',
  'user-' + 'employee', 'user-' + 'manager', 'user-' + 'director', 'user-' + 'admin',
  'X-Demo-' + 'User-Id', 'DEMO_' + 'USERS',
];
for (const path of newlyCreated) {
  const text = await readFile(path, 'utf8');
  for (const forbidden of forbiddenRuntimeIdentities) {
    assert.equal(text.includes(forbidden), false, `${relative(root, path)} contains forbidden runtime identity ${forbidden}`);
  }
  assert.doesNotMatch(text, /(?:eyJ[a-zA-Z0-9_-]{20,}\.|sb_secret_[a-zA-Z0-9_-]{12,})/,
    `${relative(root, path)} may contain a credential value`);
}

const clientFiles = (await walk(join(root, 'src'))).filter((path) => /\.(?:ts|tsx|js|jsx)$/.test(path));
for (const path of clientFiles) {
  const text = await readFile(path, 'utf8');
  assert.doesNotMatch(text, /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/,
    `${relative(root, path)} references a server-only Supabase credential`);
}

for (const legacyName of [
  'user_' + 'credentials', 'auth_' + 'sessions',
  'user_' + 'invitations', 'password_' + 'reset_tokens',
]) {
  assert.equal(migrationText.includes(`create table public.${legacyName}`), false,
    `Phase 2A recreates legacy Auth table ${legacyName}`);
}

console.log('Phase 2A static security checks passed.');
