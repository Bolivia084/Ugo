import type { AnswerRecord, AttemptResult, ExamCode } from '@ugo/shared';
import { api, isNetworkError } from './api';
import { getDb } from './db';

export interface PendingAttempt {
  clientId: string;
  examCode: ExamCode;
  subjectId?: string;
  mode: 'PRACTICE' | 'MOCK' | 'SAMPLE_MOCK';
  startedAt: string;
  finishedAt: string;
  answers: AnswerRecord[];
}

/** Saves a finished attempt on the phone first, then tries to sync. Nothing is lost offline. */
export async function saveAttempt(a: PendingAttempt, result: AttemptResult): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT OR IGNORE INTO pending_attempts (client_id, body, created_at) VALUES (?, ?, ?)', a.clientId, JSON.stringify(a), new Date().toISOString());
    await db.runAsync(
      'INSERT OR REPLACE INTO local_attempts (client_id, exam_code, subject_id, mode, finished_at, percentage, result) VALUES (?, ?, ?, ?, ?, ?, ?)',
      a.clientId,
      a.examCode,
      a.subjectId ?? null,
      a.mode,
      a.finishedAt,
      result.percentage,
      JSON.stringify(result),
    );
  });
  void syncNow();
}

let running: Promise<void> | null = null;

/**
 * Sends pending attempts and custom flashcards. The server ignores attempts it already has
 * (same client id), so a retry after a dropped connection never duplicates a result.
 */
export function syncNow(): Promise<void> {
  running ??= (async () => {
    try {
      const db = await getDb();
      const pending = await db.getAllAsync<{ client_id: string; body: string }>('SELECT client_id, body FROM pending_attempts ORDER BY created_at LIMIT 100');
      const cards = await db.getAllAsync<{ client_id: string; deck_name: string; front: string; back: string; updated_at: string; deleted: number }>('SELECT * FROM custom_cards WHERE synced = 0 LIMIT 500');
      if (!pending.length && !cards.length) return;
      const res = await api<{ accepted: string[] }>('/sync', {
        body: {
          attempts: pending.map((p) => JSON.parse(p.body)),
          flashcards: cards.map((c) => ({ clientId: c.client_id, deckName: c.deck_name, front: c.front, back: c.back, updatedAt: c.updated_at, deleted: Boolean(c.deleted) })),
        },
      });
      await db.withTransactionAsync(async () => {
        for (const id of res.accepted) await db.runAsync('DELETE FROM pending_attempts WHERE client_id = ?', id);
        for (const c of cards) await db.runAsync('UPDATE custom_cards SET synced = 1 WHERE client_id = ? AND updated_at = ?', c.client_id, c.updated_at);
      });
    } catch (e) {
      if (!isNetworkError(e)) console.warn('Sync failed', e);
    } finally {
      running = null;
    }
  })();
  return running;
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  return (await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM pending_attempts'))?.n ?? 0;
}
