import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const defaultDatabasePath = path.resolve(moduleDir, '../data/widgetflow.db');

export function createDatabaseConnection(databasePath = defaultDatabasePath): Database.Database {
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const connection = new Database(databasePath);
  connection.pragma('foreign_keys = ON');
  connection.pragma('journal_mode = WAL');
  return connection;
}
