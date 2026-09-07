import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDatabaseConnection, defaultDatabasePath } from './connection.js';
import { migrations } from './migrations/index.js';
import { runMigrations } from './migrations/migrationRunner.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(moduleDir, './schema.sql');

export const db = createDatabaseConnection(process.env.WIDGETFLOW_DB_PATH || defaultDatabasePath);

export function initializeDatabase(connection = db) {
  connection.exec(fs.readFileSync(schemaPath, 'utf8'));
  return runMigrations(connection, migrations);
}

export const initDatabase = initializeDatabase;
