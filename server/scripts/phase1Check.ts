import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'widgetflow-phase1-'));
const appDbPath = path.join(tempDir, 'app.db');
process.env.WIDGETFLOW_DB_PATH = appDbPath;
process.env.NODE_ENV = 'development';

let server: import('node:http').Server | undefined;

try {
  const [{ createDatabaseConnection }, { initializeDatabase, db }, { createApp }, { getSecurityConfig }] = await Promise.all([
    import('../db/connection.js'),
    import('../db/database.js'),
    import('../app.js'),
    import('../config/securityConfig.js'),
  ]);

  const freshPath = path.join(tempDir, 'fresh.db');
  const fresh = createDatabaseConnection(freshPath);
  const firstRun = initializeDatabase(fresh);
  assert.deepEqual(firstRun.map((migration) => migration.version), [1, 2, 3, 4]);
  assert.equal((fresh.pragma('foreign_keys', { simple: true }) as number), 1);
  assert.equal((fresh.pragma('journal_mode', { simple: true }) as string).toLowerCase(), 'wal');
  assert.equal((fresh.prepare(`SELECT COUNT(*) AS count FROM schema_migrations`).get() as { count: number }).count, 4);
  assert.equal((fresh.prepare(`PRAGMA foreign_key_list(report_templates)`).all() as any[])
    .some((foreignKey) => foreignKey.from === 'target_role_id' && foreignKey.table === 'roles'), true);
  assert.deepEqual(initializeDatabase(fresh), []);
  fresh.close();
  console.log('✓ fresh database applies ordered migrations once with FK/WAL enabled');

  const upgradePath = path.join(tempDir, 'upgrade.db');
  const upgrade = createDatabaseConnection(upgradePath);
  initializeDatabase(upgrade);
  upgrade.pragma('foreign_keys = OFF');
  const templateTableSql = (upgrade.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'report_templates'`).get() as { sql: string }).sql;
  upgrade.exec(templateTableSql
    .replace('CREATE TABLE report_templates', 'CREATE TABLE report_templates_without_target_fk')
    .replace('target_role_id TEXT REFERENCES roles(id)', 'target_role_id TEXT'));
  upgrade.exec(`INSERT INTO report_templates_without_target_fk SELECT * FROM report_templates;
    DROP TABLE report_templates;
    ALTER TABLE report_templates_without_target_fk RENAME TO report_templates;
    DELETE FROM schema_migrations;`);
  upgrade.exec(`
    INSERT INTO roles (id, key, name, role_type, governance_level, is_active, is_protected)
    VALUES ('role-upgrade', 'upgrade', 'Upgrade Role', 'Custom', 'Manager', 1, 0);
    INSERT INTO users (id, name, email, role, role_id, avatar_initials, avatar_bg, department, status)
    VALUES ('user-upgrade', 'Upgrade User', 'upgrade@example.test', 'Employee', 'role-upgrade', 'UU', '#000', 'QA', 'Active');
    INSERT INTO report_template_categories (id, name, description, status)
    VALUES ('cat-upgrade', 'Upgrade', 'Upgrade fixture', 'Active');
    INSERT INTO report_templates
      (id, name, description, category_id, status, created_by, created_by_name, created_by_role,
       target_role_id, assignment_strategy_snapshot)
    VALUES
      ('tpl-direct-upgrade', 'Direct legacy', 'Fixture', 'cat-upgrade', 'Approved', 'user-upgrade', 'Upgrade User', 'Upgrade Role',
       'DIRECT_PUBLISH', 'DIRECT_PUBLISH'),
      ('tpl-history-upgrade', 'Historical assignment', 'Fixture', 'cat-upgrade', 'Pending Approval', 'user-upgrade', 'Upgrade User', 'Upgrade Role',
       'role-upgrade', 'ROLE_QUEUE');
    INSERT INTO system_general_settings (setting_key, setting_value, setting_type) VALUES
      ('governance.strategy.director', 'DIRECT_PUBLISH', 'string'),
      ('governance.routing.director', 'DIRECT_PUBLISH', 'string'),
      ('governance.user.director', 'DIRECT_PUBLISH', 'string');
  `);
  upgrade.pragma('foreign_keys = ON');
  initializeDatabase(upgrade);
  const direct = upgrade.prepare(`SELECT target_role_id AS targetRoleId, requested_approval_from_user_id AS reviewerId FROM report_templates WHERE id = 'tpl-direct-upgrade'`).get() as any;
  assert.equal(direct.targetRoleId, null);
  assert.equal(direct.reviewerId, null);
  const historical = upgrade.prepare(`SELECT target_role_id AS targetRoleId, assignment_strategy_snapshot AS strategy FROM report_templates WHERE id = 'tpl-history-upgrade'`).get() as any;
  assert.deepEqual(historical, { targetRoleId: 'role-upgrade', strategy: 'ROLE_QUEUE' });
  assert.equal((upgrade.prepare(`SELECT COUNT(*) AS count FROM system_general_settings WHERE setting_key IN ('governance.routing.director', 'governance.user.director')`).get() as any).count, 0);
  assert.equal((upgrade.prepare(`PRAGMA foreign_key_list(report_templates)`).all() as any[])
    .some((foreignKey) => foreignKey.from === 'target_role_id' && foreignKey.table === 'roles'), true);
  upgrade.close();
  console.log('✓ unversioned upgrade normalizes DIRECT_PUBLISH sentinels without rewriting historical assignments');

  const developmentApp = createApp({ security: getSecurityConfig({ nodeEnv: 'development', clientOrigins: ['http://localhost:5173'], demoIdentityEnabled: true }) });
  server = developmentApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const api = async (url: string, userId?: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (userId) headers.set('X-Demo-User-Id', userId);
    if (init.body) headers.set('Content-Type', 'application/json');
    return fetch(`${baseUrl}${url}`, { ...init, headers });
  };

  assert.equal((await api('/api/health')).status, 200);
  assert.equal((await api('/api/authorization/me')).status, 401);
  assert.equal((await api('/api/authorization/me', 'does-not-exist')).status, 401);
  assert.equal((await api('/api/demo/reset', 'user-employee', { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await api('/api/demo/reset', 'user-admin', { method: 'POST', body: '{}' })).status, 200);

  db.prepare(`INSERT INTO roles (id, key, name, description, role_type, governance_level, is_active, is_protected)
    VALUES ('role-no-template', 'no_template', 'No Template', '', 'Custom', 'None', 1, 0)`).run();
  db.prepare(`INSERT INTO users (id, name, email, role, role_id, avatar_initials, avatar_bg, department, status)
    VALUES ('user-no-template', 'No Template User', 'no-template@example.test', 'Employee', 'role-no-template', 'NT', '#000', 'QA', 'Active')`).run();
  assert.equal((await api('/api/template-import/analyze', 'user-no-template', { method: 'POST' })).status, 403);

  const categoryId = (db.prepare(`SELECT id FROM report_template_categories LIMIT 1`).get() as { id: string }).id;
  db.prepare(`INSERT INTO report_templates
    (id, name, description, category_id, status, created_by, created_by_name, created_by_role)
    VALUES ('tpl-private-phase1', 'Private Phase 1', 'Authorization fixture', ?, 'Draft', 'user-manager', 'Sarah Mohamed', 'Manager')`).run(categoryId);
  assert.equal((await api('/api/templates/tpl-private-phase1', 'user-employee')).status, 403);
  const listResponse = await api('/api/templates', 'user-employee');
  const listBody = await listResponse.json() as any;
  assert.equal(listBody.data.some((template: any) => template.id === 'tpl-private-phase1'), false);

  const approvedTemplate = db.prepare(`SELECT id, category_id AS categoryId, name FROM report_templates WHERE status = 'Approved' LIMIT 1`).get() as any;
  db.prepare(`INSERT INTO reports
    (id, template_id, template_name, title, category_id, category_name, created_by, created_by_name, created_by_role, status, sent_to_user_id, sent_to_name)
    VALUES ('rep-private-phase1', ?, ?, 'Private Phase 1 Report', ?, 'Fixture', 'user-manager', 'Sarah Mohamed', 'Manager', 'Sent', 'user-director', 'Omar Ali')`)
    .run(approvedTemplate.id, approvedTemplate.name, approvedTemplate.categoryId);
  assert.equal((await api('/api/reports/rep-private-phase1/comments', 'user-employee')).status, 403);
  console.log('✓ development HTTP authorization, intake, reset, template, and report-comment checks pass');

  await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  server = undefined;

  const productionApp = createApp({ initializeDatabase: false, security: getSecurityConfig({ nodeEnv: 'production', clientOrigins: ['https://widgetflow.example'] }) });
  server = productionApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const productionAddress = server.address();
  assert(productionAddress && typeof productionAddress === 'object');
  const productionBase = `http://127.0.0.1:${productionAddress.port}`;
  assert.equal((await fetch(`${productionBase}/api/authorization/me`, { headers: { 'X-Demo-User-Id': 'user-admin' } })).status, 401);
  assert.equal((await fetch(`${productionBase}/api/authorization/me`, { headers: { Origin: 'https://evil.example', 'X-Demo-User-Id': 'user-admin' } })).status, 403);
  assert.equal((await fetch(`${productionBase}/api/demo/reset`, { method: 'POST', headers: { Origin: 'https://widgetflow.example', 'X-Demo-User-Id': 'user-admin' } })).status, 404);
  console.log('✓ production rejects demo identity and does not expose Demo Reset');

  console.log('Phase 1 focused verification passed.');
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  try {
    const { db } = await import('../db/database.js');
    if (db.open) db.close();
  } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
}
