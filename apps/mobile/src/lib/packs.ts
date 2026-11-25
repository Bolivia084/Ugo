import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { gunzipSync } from 'fflate';
import type { ExamCode } from '@ugo/shared';
import { api } from './api';
import { getDb } from './db';

export interface PackManifest {
  examCode: ExamCode;
  version: number;
  isSampleOnly: boolean;
  sizeBytes: number;
  sha256: string;
  whatsNew: string;
  url: string;
}

interface PackDoc {
  examCode: ExamCode;
  version: number;
  isSampleOnly: boolean;
  items: { id: string; kind: string; subjectId: string; subjectName: string; topicId: string | null; topicName: string | null; title: string; year: number | null; isSample: boolean; payload: unknown }[];
}

export interface LocalPack {
  exam_code: ExamCode;
  version: number;
  is_sample: number;
  whats_new: string | null;
  downloaded_at: string;
}

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export async function localPack(examCode: ExamCode): Promise<LocalPack | null> {
  const db = await getDb();
  return db.getFirstAsync<LocalPack>('SELECT exam_code, version, is_sample, whats_new, downloaded_at FROM packs WHERE exam_code = ?', examCode);
}

/**
 * Downloads the current pack for an exam if it differs from the copy on the phone
 * (a newer version, a rollback, or an upgrade from the free sample to the full pack).
 * The file is checked against its SHA-256 before anything is replaced.
 * Returns the "What's new" text when something changed.
 */
export async function syncPack(examCode: ExamCode, opts: { background: boolean; wifiOnly: boolean }): Promise<string | null> {
  if (opts.background && opts.wifiOnly) {
    const net = await Network.getNetworkStateAsync();
    if (net.type !== Network.NetworkStateType.WIFI) return null;
  }
  const manifest = await api<PackManifest>(`/content/packs/${examCode}`);
  const current = await localPack(examCode);
  if (current && current.version === manifest.version && Boolean(current.is_sample) === manifest.isSampleOnly) return null;

  const res = await fetch(manifest.url);
  if (!res.ok) throw new Error('Download failed. Try again on a better connection.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const digest = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
  if (digest !== manifest.sha256) throw new Error('The download was damaged. Please try again.');
  const doc = JSON.parse(new TextDecoder().decode(gunzipSync(bytes))) as PackDoc;
  if (doc.examCode !== examCode || doc.version !== manifest.version) throw new Error('Unexpected content pack');

  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM items WHERE exam_code = ?', examCode);
    const stmt = await tx.prepareAsync('INSERT INTO items (id, exam_code, kind, subject_id, subject_name, topic_id, topic_name, title, year, is_sample, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    try {
      for (const i of doc.items) {
        await stmt.executeAsync(i.id, examCode, i.kind, i.subjectId, i.subjectName, i.topicId, i.topicName, i.title, i.year, i.isSample ? 1 : 0, JSON.stringify(i.payload));
      }
    } finally {
      await stmt.finalizeAsync();
    }
    await tx.runAsync('INSERT OR REPLACE INTO packs (exam_code, version, is_sample, sha256, whats_new, downloaded_at) VALUES (?, ?, ?, ?, ?, ?)', examCode, manifest.version, manifest.isSampleOnly ? 1 : 0, manifest.sha256, manifest.whatsNew, new Date().toISOString());
  });
  // "What's new" is only shown after the download has succeeded.
  return manifest.whatsNew;
}
