import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { AuthFlowError } from '../../src/features/auth/authErrors.js';
import { createAuthService, mapCurrentPrincipal } from '../../src/features/auth/authService.js';
import { resolveAuthView } from '../../src/features/auth/authGate.js';
import { isProtectedAdmin, principalToAppUser } from '../../src/features/auth/authTypes.js';
import type { AuthRepository, AuthStateListener, SignInResult } from '../../src/features/auth/supabaseAuthRepository.js';
import type { CurrentPrincipalRow, LoginCredentials } from '../../src/features/auth/authTypes.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '../..');

const activeAdminRow: CurrentPrincipalRow = {
  user_id: '11111111-1111-4111-8111-111111111111',
  full_name: 'Configured Administrator',
  email: 'configured@example.test',
  profile_code: 'AD-001-0926',
  profile_status: 'Active',
  role_id: '22222222-2222-4222-8222-222222222222',
  role_key: 'admin',
  role_name: 'Admin',
  role_type: 'System',
  governance_level: 'None',
  role_active: true,
  role_protected: true,
  effective_permissions: [],
};

function createMockRepository(initialRow: CurrentPrincipalRow | null) {
  const calls: string[] = [];
  let row = initialRow;
  let listener: AuthStateListener | null = null;
  let receivedCredentials: LoginCredentials | null = null;
  const signInResult = {
    session: { access_token: 'test-access-token', user: { id: activeAdminRow.user_id } } as unknown as Session,
    user: { id: activeAdminRow.user_id },
  } as unknown as SignInResult;

  const repository: AuthRepository = {
    async signIn(credentials) {
      calls.push('signIn');
      receivedCredentials = credentials;
      return signInResult;
    },
    async signOut() {
      calls.push('signOut');
    },
    async currentPrincipal() {
      calls.push('currentPrincipal');
      return row;
    },
    onAuthStateChange(nextListener) {
      calls.push('onAuthStateChange');
      listener = nextListener;
      return () => { listener = null; };
    },
  };

  return {
    repository,
    calls,
    signInResult,
    get receivedCredentials() { return receivedCredentials; },
    setRow(next: CurrentPrincipalRow | null) { row = next; },
    emit(event: AuthChangeEvent, session: Session | null) { listener?.(event, session); },
  };
}

async function expectAuthCode(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) =>
    error instanceof AuthFlowError && error.authError.code === code);
}

const mock = createMockRepository(activeAdminRow);
const service = createAuthService(mock.repository);
const password = '  password whitespace is preserved  ';
await service.signIn({ email: '  Configured@Example.Test ', password });
assert.deepEqual(mock.receivedCredentials, {
  email: 'configured@example.test',
  password,
});
const adminPrincipal = await service.resolvePrincipal();
assert.deepEqual(mock.calls.slice(0, 2), ['signIn', 'currentPrincipal']);
assert.equal(adminPrincipal.effectivePermissions.length, 0);
assert.equal(isProtectedAdmin(adminPrincipal), true);
assert.equal(principalToAppUser(adminPrincipal).role, 'Admin');
assert.equal(principalToAppUser(adminPrincipal).id, activeAdminRow.user_id);
assert.equal(principalToAppUser(adminPrincipal).profileCode, activeAdminRow.profile_code);

const ordinaryPrincipal = mapCurrentPrincipal({
  ...activeAdminRow,
  role_key: 'operations-reviewer',
  role_name: 'Operations Reviewer',
  role_type: 'Custom',
  governance_level: 'Manager',
  role_protected: false,
  effective_permissions: ['reports.view_received'],
});
assert.equal(isProtectedAdmin(ordinaryPrincipal), false);

mock.setRow(null);
await expectAuthCode(() => service.resolvePrincipal(), 'ACCOUNT_NOT_CONFIGURED');
mock.setRow({ ...activeAdminRow, profile_status: 'Inactive', effective_permissions: [] });
await expectAuthCode(() => service.resolvePrincipal(), 'ACCOUNT_INACTIVE');
await service.signOut();
assert.equal(mock.calls.at(-1), 'signOut');

assert.equal(resolveAuthView('initializing'), 'loading');
assert.equal(resolveAuthView('authenticating'), 'loading');
assert.equal(resolveAuthView('authenticated'), 'application');
assert.equal(resolveAuthView('unauthenticated'), 'login');
assert.equal(resolveAuthView('blocked'), 'login');

const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const frontendFiles = fs.readdirSync(path.join(root, 'src'), { recursive: true })
  .filter((entry): entry is string => typeof entry === 'string' && /\.(?:ts|tsx)$/.test(entry))
  .map((entry) => path.join(root, 'src', entry));
const frontendSource = frontendFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const authContextSource = read('src/features/auth/AuthContext.tsx');
const loginSource = read('src/features/auth/LoginPage.tsx');
const repositorySource = read('src/features/auth/supabaseAuthRepository.ts');
const appSource = read('src/App.tsx');

assert.match(repositorySource, /auth\.signInWithPassword\(/);
assert.match(repositorySource, /rpc\('current_principal'\)/);
assert.match(repositorySource, /auth\.onAuthStateChange\(/);
assert.match(authContextSource, /'INITIAL_SESSION'/);
assert.match(authContextSource, /'TOKEN_REFRESHED'/);
assert.match(authContextSource, /authService\.signIn\(credentials\)[\s\S]*establishSession\(session\)/);
assert.match(authContextSource, /principal:\s*null/);
assert.match(authContextSource, /refreshPrincipal/);
assert.doesNotMatch(frontendSource, /\/api\/auth\/(?:login|logout|me|session)/);
assert.doesNotMatch(loginSource, /Forgot password|Register|Sign Up|Change Password/i);
assert.doesNotMatch(appSource, /RoleSwitcher|demoMode|isDemoIdentityMode/);
assert.doesNotMatch(authContextSource, /DEMO_USERS|user-employee|default.*Employee/i);
assert.doesNotMatch(frontendSource, /VITE_SUPABASE_(?:SECRET|SERVICE_ROLE)|SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY/);
assert.doesNotMatch(loginSource, /userId|user_id|\.id\}/);

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
console.log('Phase 2B frontend Auth checks passed.');
