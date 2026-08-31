import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BUSY_TIMEOUT_MS = 5000;
const WAL_RETRY_BUDGET_MS = BUSY_TIMEOUT_MS;
const WAL_RETRY_INTERVAL_MS = 20;

export function isDatabaseLocked(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ((error as { readonly code?: unknown }).code === 'SQLITE_BUSY') return true;
  return String((error as { readonly message?: unknown }).message ?? '').toLowerCase().includes('sqlite_busy') || String((error as { readonly message?: unknown }).message ?? '').toLowerCase().includes('database is locked');
}

export interface JournalModeCapableDatabase {
  exec(sql: string): unknown;
  query(sql: string): { get(): { readonly journal_mode?: string } | null | undefined };
}

function journalMode(db: JournalModeCapableDatabase): string {
  return String(db.query('PRAGMA journal_mode').get()?.journal_mode ?? '').toLowerCase();
}

export function enableWalMode(
  db: JournalModeCapableDatabase,
  options: { readonly budgetMs?: number; readonly intervalMs?: number; readonly sleep?: (ms: number) => void } = {},
): void {
  if (journalMode(db) === 'wal') return;
  const budgetMs = options.budgetMs ?? WAL_RETRY_BUDGET_MS;
  const intervalMs = options.intervalMs ?? WAL_RETRY_INTERVAL_MS;
  const sleep = options.sleep ?? ((ms: number) => Bun.sleepSync(ms));
  const deadline = Date.now() + budgetMs;
  for (;;) {
    try {
      db.exec('PRAGMA journal_mode = WAL;');
      return;
    } catch (error) {
      if (!isDatabaseLocked(error)) throw error;
      if (journalMode(db) === 'wal') return;
      if (Date.now() >= deadline) throw error;
      sleep(intervalMs);
    }
  }
}

export function openSqliteDatabase(dbPath: string): Database {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath, { create: true });
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
  enableWalMode(db);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

export function openReadonlySqliteDatabase(dbPath: string): Database {
  const db = new Database(dbPath, { readonly: true, create: false });
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS};`);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}
