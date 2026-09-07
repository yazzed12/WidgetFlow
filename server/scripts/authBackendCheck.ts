import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgetflow-auth-'));
process.env.WIDGETFLOW_DB_PATH = path.join(tempDir, 'auth.db');
process.env.NODE_ENV = 'development';
process.env.AUTH_LOGIN_RATE_LIMIT = '100';
process.env.AUTH_TOKEN_RATE_LIMIT = '100';

let server: import('node:http').Server | undefined;

type ApiResult = { status: number; body: any; cookie?: string; setCookie?: string };

try {
  const [{ createApp }, { getSecurityConfig }, { db }, { passwordService }, { credentialRepository }, { clearAuthRateLimitsForTests }] = await Promise.all([
    import('../app.js'), import('../config/securityConfig.js'), import('../db/database.js'), import('../auth/passwordService.js'),
    import('../repositories/credentialRepository.js'), import('../middleware/authRateLimit.js'),
  ]);

  const start = async (nodeEnv: string) => {
    const security = getSecurityConfig({ nodeEnv, clientOrigins: ['https://widgetflow.example'] });
    const app = createApp({ security });
    const instance = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => instance.once('listening', resolve));
    const address = instance.address();
    assert(address && typeof address === 'object');
    return { instance, baseUrl: `http://127.0.0.1:${address.port}`, security };
  };

  let running = await start('development');
  server = running.instance;
  const call = async (pathName: string, options: { method?: string; body?: any; userId?: string; cookie?: string; origin?: string } = {}): Promise<ApiResult> => {
    const headers = new Headers();
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.userId) headers.set('X-Demo-User-Id', options.userId);
    if (options.cookie) headers.set('Cookie', options.cookie);
    if (options.origin) headers.set('Origin', options.origin);
    const response = await fetch(`${running.baseUrl}${pathName}`, {
      method: options.method || (options.body !== undefined ? 'POST' : 'GET'), headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const setCookie = response.headers.get('set-cookie') || undefined;
    const responseText = await response.text();
    let body: any;
    try { body = JSON.parse(responseText); }
    catch {
      if (response.status !== 404) {
        throw new Error(`${pathName} returned ${response.status} non-JSON: ${responseText.slice(0, 200)}`);
      }
      body = { raw: responseText };
    }
    return { status: response.status, body, setCookie, cookie: setCookie?.split(';')[0] };
  };

  const password = 'Correct horse battery 42';
  credentialRepository.upsert('user-admin', await passwordService.hashPassword(password));
  const adminLogin = await call('/api/auth/login', {
    body: { email: 'lina.nasser@widgetflow.demo', password },
  });
  assert.equal(adminLogin.status, 200);

  const originalRoleId = (db.prepare(`SELECT role_id AS roleId FROM users WHERE id = 'user-employee'`).get() as any).roleId;
  const invite = await call('/api/auth/invitations', { cookie: adminLogin.cookie, body: { userId: 'user-employee' } });
  assert.equal(invite.status, 200);
  assert.match(invite.body.data.developmentInvitationUrl, /invitation=/);
  const invitationToken = new URL(invite.body.data.developmentInvitationUrl).searchParams.get('invitation')!;
  const invitationRow = db.prepare(`SELECT token_hash AS tokenHash FROM user_invitations WHERE user_id = 'user-employee'`).get() as any;
  assert.notEqual(invitationRow.tokenHash, invitationToken);
  assert.equal(invitationRow.tokenHash.length, 64);
  const accepted = await call('/api/auth/invitations/accept', { body: { token: invitationToken, password } });
  assert.equal(accepted.status, 200);
  const employeeLogin = await call('/api/auth/login', {
    body: { email: 'ahmed.hassan@company.local', password },
  });
  assert.equal((await call('/api/auth/invitations', { cookie: employeeLogin.cookie, body: { userId: 'user-director' } })).status, 403);
  assert.equal((db.prepare(`SELECT role_id AS roleId FROM users WHERE id = 'user-employee'`).get() as any).roleId, originalRoleId);
  const credential = credentialRepository.findByUserId('user-employee')!;
  assert.notEqual(credential.passwordHash, password);
  assert.equal(credential.passwordHash.includes(password), false);
  assert.equal(await passwordService.verifyPassword(password, credential.passwordHash), true);
  assert.equal(await passwordService.verifyPassword('wrong password', credential.passwordHash), false);
  await assert.rejects(() => passwordService.hashPassword('short'), (error: any) => error.code === 'PASSWORD_POLICY_FAILED');
  assert.equal((await call('/api/auth/invitations/accept', { body: { token: invitationToken, password } })).body.error.code, 'INVITATION_ALREADY_USED');
  assert.equal((await call('/api/auth/invitations/accept', { body: { token: 'invalid', password } })).body.error.code, 'INVITATION_INVALID');
  const expiredInvite = await call('/api/auth/invitations', { cookie: adminLogin.cookie, body: { userId: 'user-manager' } });
  const expiredInviteToken = new URL(expiredInvite.body.data.developmentInvitationUrl).searchParams.get('invitation')!;
  db.prepare(`UPDATE user_invitations SET expires_at = ? WHERE user_id = 'user-manager'`).run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await call('/api/auth/invitations/accept', { body: { token: expiredInviteToken, password } })).body.error.code, 'INVITATION_EXPIRED');

  const wrong = await call('/api/auth/login', { body: { email: 'ahmed.hassan@company.local', password: 'wrong password' } });
  const unknown = await call('/api/auth/login', { body: { email: 'unknown@example.test', password: 'wrong password' } });
  assert.deepEqual({ status: wrong.status, code: wrong.body.error.code, message: wrong.body.error.message },
    { status: unknown.status, code: unknown.body.error.code, message: unknown.body.error.message });

  const login = await call('/api/auth/login', { body: { email: '  AHMED.HASSAN@COMPANY.LOCAL ', password } });
  assert.equal(login.status, 200);
  assert.match(login.setCookie!, /HttpOnly/i);
  assert.doesNotMatch(login.setCookie!, /; Secure/i);
  assert.equal(login.setCookie!.includes(password), false);
  const rawSessionToken = login.cookie!.split('=')[1];
  const storedSession = db.prepare(`SELECT token_hash AS tokenHash FROM auth_sessions WHERE user_id = 'user-employee' ORDER BY created_at DESC LIMIT 1`).get() as any;
  assert.notEqual(storedSession.tokenHash, rawSessionToken);
  assert.equal(storedSession.tokenHash.length, 64);
  let me = await call('/api/auth/me', { cookie: login.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.data.id, 'user-employee');
  assert.equal('passwordHash' in me.body.data, false);

  db.prepare(`UPDATE users SET role_id = 'role-manager' WHERE id = 'user-employee'`).run();
  me = await call('/api/auth/me', { cookie: login.cookie });
  assert.equal(me.body.data.roleId, 'role-manager');
  db.prepare(`UPDATE users SET role_id = ? WHERE id = 'user-employee'`).run(originalRoleId);
  const permissionId = (db.prepare(`SELECT id FROM role_permissions WHERE role_id = ? AND permission_key = 'templates.create'`).get(originalRoleId) as any).id;
  db.prepare(`DELETE FROM role_permissions WHERE id = ?`).run(permissionId);
  me = await call('/api/auth/me', { cookie: login.cookie });
  assert.equal(me.body.data.permissions.includes('templates.create'), false);
  db.prepare(`INSERT INTO role_permissions (id, role_id, permission_key) VALUES (?, ?, 'templates.create')`).run(permissionId, originalRoleId);

  for (const adminPath of [
    '/api/admin/config', '/api/admin/features', '/api/admin/elements', '/api/admin/users',
    '/api/admin/roles', '/api/admin/roles-assignable', '/api/admin/governance-routing',
    '/api/admin/categories', '/api/admin/audit', '/api/admin/packs', '/api/admin/content-library',
  ]) {
    assert.equal((await call(adminPath, { cookie: adminLogin.cookie })).status, 200, adminPath);
  }
  assert.equal((await call('/api/admin/users', { cookie: employeeLogin.cookie })).status, 403);
  assert.equal((await call('/api/demo/reset', { cookie: adminLogin.cookie, body: {} })).status, 404);

  credentialRepository.upsert('user-manager', await passwordService.hashPassword(password));
  const managerLogin = await call('/api/auth/login', {
    body: { email: 'sarah.mohamed@company.local', password },
  });
  assert.equal(managerLogin.status, 200);
  const managerAuthority = await call('/api/authorization/me', {
    cookie: managerLogin.cookie,
    userId: 'user-admin',
  });
  assert.equal(managerAuthority.body.data.id, 'user-manager');
  assert.equal(managerAuthority.body.data.roleKey, 'manager');
  assert.equal(managerAuthority.body.data.permissions.includes('template_approvals.approve'), true);
  const managerQueue = await call('/api/template-approvals', { cookie: managerLogin.cookie });
  assert.equal(managerQueue.status, 200);
  assert.equal(managerQueue.body.data.some((template: any) => template.id === 'tpl-req-1'), true);
  const managerApproval = await call('/api/templates/tpl-req-1/approve', {
    cookie: managerLogin.cookie,
    body: {},
  });
  assert.equal(managerApproval.status, 200);
  const approvalAudit = db.prepare(`SELECT person_name AS personName, role FROM template_audit_history
    WHERE template_id = 'tpl-req-1' AND action = 'Approved' ORDER BY timestamp DESC LIMIT 1`).get() as any;
  assert.deepEqual(approvalAudit, { personName: 'Sarah Mohamed', role: 'Manager' });

  db.prepare(`INSERT INTO roles (id, key, name, description, role_type, governance_level, is_active, is_protected)
    VALUES ('role-auth-custom', 'auth-custom', 'Session Reviewer', '', 'Custom', 'Manager', 1, 0)`).run();
  db.prepare(`INSERT INTO role_permissions (id, role_id, permission_key)
    VALUES ('rp-auth-custom-view', 'role-auth-custom', 'templates.view_approved')`).run();
  db.prepare(`INSERT INTO users (id, name, email, role, role_id, avatar_initials, avatar_bg, department, status)
    VALUES ('user-auth-custom', 'Session Custom', 'session.custom@company.local', 'Employee', 'role-auth-custom', 'SC', 'bg-indigo-600', 'QA', 'Active')`).run();
  credentialRepository.upsert('user-auth-custom', await passwordService.hashPassword(password));
  const customLogin = await call('/api/auth/login', {
    body: { email: 'session.custom@company.local', password },
  });
  assert.equal(customLogin.status, 200);
  const customAuthority = await call('/api/authorization/me', { cookie: customLogin.cookie });
  assert.equal(customAuthority.body.data.role, 'Session Reviewer');
  assert.equal(customAuthority.body.data.roleType, 'Custom');
  assert.equal(customAuthority.body.data.governanceLevel, 'Manager');
  assert.deepEqual(customAuthority.body.data.permissions, ['templates.view_approved']);
  assert.equal((await call('/api/admin/config', { cookie: customLogin.cookie })).status, 403);
  console.log('✓ session admin, Sarah approval, custom-role authority, demo isolation, and historical audit context');

  const logout = await call('/api/auth/logout', { cookie: login.cookie, body: {} });
  assert.equal(logout.status, 200);
  assert.match(logout.setCookie!, /Max-Age=0|Expires=/i);
  assert.equal((await call('/api/auth/me', { cookie: login.cookie })).body.error.code, 'SESSION_REVOKED');
  assert.equal((await call('/api/auth/logout', { body: {} })).status, 200);

  const loginBeforeReset = await call('/api/auth/login', { body: { email: 'ahmed.hassan@company.local', password } });
  const forgotExisting = await call('/api/auth/forgot-password', { body: { email: 'ahmed.hassan@company.local' } });
  const forgotUnknown = await call('/api/auth/forgot-password', { body: { email: 'unknown@example.test' } });
  assert.equal(forgotExisting.body.data.message, forgotUnknown.body.data.message);
  const resetToken = new URL(forgotExisting.body.data.developmentResetUrl).searchParams.get('token')!;
  const resetRow = db.prepare(`SELECT token_hash AS tokenHash FROM password_reset_tokens WHERE user_id = 'user-employee' ORDER BY created_at DESC LIMIT 1`).get() as any;
  assert.notEqual(resetRow.tokenHash, resetToken);
  const newPassword = 'Replacement password 84';
  assert.equal((await call('/api/auth/reset-password', { body: { token: resetToken, password: newPassword } })).status, 200);
  assert.equal((await call('/api/auth/me', { cookie: loginBeforeReset.cookie })).body.error.code, 'SESSION_REVOKED');
  assert.equal((await call('/api/auth/login', { body: { email: 'ahmed.hassan@company.local', password } })).body.error.code, 'INVALID_CREDENTIALS');
  assert.equal((await call('/api/auth/login', { body: { email: 'ahmed.hassan@company.local', password: newPassword } })).status, 200);
  assert.equal((await call('/api/auth/reset-password', { body: { token: resetToken, password: newPassword } })).body.error.code, 'RESET_TOKEN_ALREADY_USED');
  assert.equal((await call('/api/auth/reset-password', { body: { token: 'invalid', password: newPassword } })).body.error.code, 'RESET_TOKEN_INVALID');
  const expiredResetRequest = await call('/api/auth/forgot-password', { body: { email: 'ahmed.hassan@company.local' } });
  const expiredResetToken = new URL(expiredResetRequest.body.data.developmentResetUrl).searchParams.get('token')!;
  db.prepare(`UPDATE password_reset_tokens SET expires_at = ? WHERE token_hash = (SELECT token_hash FROM password_reset_tokens WHERE user_id = 'user-employee' ORDER BY created_at DESC LIMIT 1)`)
    .run(new Date(Date.now() - 1000).toISOString());
  assert.equal((await call('/api/auth/reset-password', { body: { token: expiredResetToken, password: newPassword } })).body.error.code, 'RESET_TOKEN_EXPIRED');

  for (const [userId, status] of [['user-manager', 'Inactive'], ['user-director', 'Resigned'], ['user-admin', 'Terminated']] as const) {
    const hash = await passwordService.hashPassword('Status test password 55');
    credentialRepository.upsert(userId, hash);
    db.prepare(`UPDATE users SET status = ? WHERE id = ?`).run(status, userId);
    const email = (db.prepare(`SELECT email FROM users WHERE id = ?`).get(userId) as any).email;
    assert.equal((await call('/api/auth/login', { body: { email, password: 'Status test password 55' } })).body.error.code, 'INVALID_CREDENTIALS');
  }
  db.prepare(`UPDATE users SET status = 'Active' WHERE id IN ('user-manager', 'user-director', 'user-admin')`).run();

  const activeLogin = await call('/api/auth/login', { body: { email: 'ahmed.hassan@company.local', password: newPassword } });
  db.prepare(`UPDATE users SET status = 'Inactive' WHERE id = 'user-employee'`).run();
  assert.equal((await call('/api/auth/me', { cookie: activeLogin.cookie })).body.error.code, 'ACCOUNT_UNAVAILABLE');
  db.prepare(`UPDATE users SET status = 'Active' WHERE id = 'user-employee'`).run();

  const expiringLogin = await call('/api/auth/login', { body: { email: 'ahmed.hassan@company.local', password: newPassword } });
  db.prepare(`UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?`).run(new Date(Date.now() - 1000).toISOString(), storedSession.tokenHash);
  // Expiry is also covered by a direct session row below to avoid coupling to prior session order.
  const latestHash = (db.prepare(`SELECT token_hash AS tokenHash FROM auth_sessions WHERE user_id = 'user-employee' ORDER BY created_at DESC LIMIT 1`).get() as any).tokenHash;
  db.prepare(`UPDATE auth_sessions SET expires_at = ? WHERE token_hash = ?`).run(new Date(Date.now() - 1000).toISOString(), latestHash);
  assert.equal((await call('/api/auth/me', { cookie: expiringLogin.cookie })).body.error.code, 'SESSION_EXPIRED');

  assert.ok((db.prepare(`SELECT COUNT(*) AS count FROM auth_audit_log WHERE event = 'AUTH_LOGIN_SUCCEEDED'`).get() as any).count > 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM auth_audit_log WHERE email_normalized LIKE '%password%'`).get() as any).count, 0);

  await new Promise<void>((resolve) => running.instance.close(() => resolve()));
  server = undefined;

  clearAuthRateLimitsForTests();
  process.env.AUTH_LOGIN_RATE_LIMIT = '1';
  running = await start('production');
  server = running.instance;
  const prodCall = call;
  const prodLogin = await prodCall('/api/auth/login', { origin: 'https://widgetflow.example', body: { email: 'ahmed.hassan@company.local', password: newPassword } });
  assert.equal(prodLogin.status, 200);
  assert.match(prodLogin.setCookie!, /HttpOnly/i);
  assert.match(prodLogin.setCookie!, /Secure/i);
  assert.equal((await prodCall('/api/authorization/me', { userId: 'user-admin' })).status, 401);
  assert.equal((await prodCall('/api/auth/login', { origin: 'https://evil.example', body: { email: 'x', password: 'x' } })).body.error.code, 'ORIGIN_NOT_ALLOWED');
  const prodForgot = await prodCall('/api/auth/forgot-password', { origin: 'https://widgetflow.example', body: { email: 'ahmed.hassan@company.local' } });
  assert.equal('developmentResetUrl' in prodForgot.body.data, false);
  assert.equal((await prodCall('/api/auth/login', { origin: 'https://widgetflow.example', body: { email: 'unknown@example.test', password: 'wrong' } })).status, 429);
  assert.equal(JSON.stringify(prodLogin.body).includes(rawSessionToken), false);
  console.log('✓ invitation, credentials, login, session, logout, reset, live authority, status, rate-limit, and production security checks pass');
  console.log('Phase 2 authentication backend verification passed.');
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  try { const { db } = await import('../db/database.js'); if (db.open) db.close(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
}
