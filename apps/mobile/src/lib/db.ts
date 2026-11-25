import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

/**
 * The on-device database, encrypted with SQLCipher. The key is random per install and kept
 * in the Keychain/Keystore, so copied app files are unreadable on another device.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
const KEY_NAME = 'ugo.db.key.v1';

async function dbKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(KEY_NAME, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  if (!key) {
    key = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(KEY_NAME, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  }
  return key;
}

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS packs (exam_code TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL, is_sample INTEGER NOT NULL, sha256 TEXT NOT NULL, whats_new TEXT, downloaded_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY NOT NULL, exam_code TEXT NOT NULL, kind TEXT NOT NULL, subject_id TEXT NOT NULL, subject_name TEXT NOT NULL, topic_id TEXT, topic_name TEXT, title TEXT NOT NULL, year INTEGER, is_sample INTEGER NOT NULL, payload TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS items_lookup ON items (exam_code, kind, subject_id);
   CREATE TABLE IF NOT EXISTS pending_attempts (client_id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS local_attempts (client_id TEXT PRIMARY KEY NOT NULL, exam_code TEXT NOT NULL, subject_id TEXT, mode TEXT NOT NULL, finished_at TEXT NOT NULL, percentage REAL NOT NULL, result TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS custom_cards (client_id TEXT PRIMARY KEY NOT NULL, deck_name TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, synced INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS downloads (item_id TEXT PRIMARY KEY NOT NULL, path TEXT NOT NULL, bytes INTEGER NOT NULL, downloaded_at TEXT NOT NULL);`,
];

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('ugo.db');
    await db.execAsync(`PRAGMA key = '${await dbKey()}';`);
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const current = row?.user_version ?? 0;
    for (let v = current; v < MIGRATIONS.length; v++) {
      await db.withTransactionAsync(async () => {
        await db.execAsync(MIGRATIONS[v]);
        await db.execAsync(`PRAGMA user_version = ${v + 1}`);
      });
    }
    return db;
  })();
  return dbPromise;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
}

/** Wipes everything for the signed in user (sign out or account deletion). */
export async function wipeLocalData(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM kv; DELETE FROM packs; DELETE FROM items; DELETE FROM pending_attempts; DELETE FROM local_attempts; DELETE FROM custom_cards; DELETE FROM downloads;');
}

export const newId = () => Crypto.randomUUID();
