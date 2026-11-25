import type { ExamCode, Question, QuestionType } from '@ugo/shared';
import { getDb } from './db';

export interface ItemRow {
  id: string;
  exam_code: ExamCode;
  kind: 'QUESTION' | 'NOTE' | 'FLASHCARD_DECK' | 'VIDEO';
  subject_id: string;
  subject_name: string;
  topic_id: string | null;
  topic_name: string | null;
  title: string;
  year: number | null;
  is_sample: number;
  payload: string;
}

export interface QuestionPayload {
  type: QuestionType;
  body: string;
  imageUrl?: string;
  options?: { key: string; text: string; imageUrl?: string }[];
  answer?: string;
  explanation: string;
  markingGuide?: string;
}

export function toQuestion(row: ItemRow): Question & { options?: QuestionPayload['options']; imageUrl?: string; markingGuide?: string } {
  const p = JSON.parse(row.payload) as QuestionPayload;
  return {
    id: row.id,
    examCode: row.exam_code,
    subjectId: row.subject_id,
    topicId: row.topic_id ?? row.subject_id,
    topicName: row.topic_name ?? row.subject_name,
    type: p.type,
    year: row.year,
    body: p.body,
    imageUrl: p.imageUrl,
    options: p.options,
    answer: p.answer ?? null,
    explanation: p.explanation,
    markingGuide: p.markingGuide,
    isSample: Boolean(row.is_sample),
  };
}

export async function subjectsWithContent(examCode: ExamCode) {
  const db = await getDb();
  return db.getAllAsync<{ subject_id: string; subject_name: string; questions: number; notes: number; decks: number; videos: number }>(
    `SELECT subject_id, subject_name,
       SUM(kind = 'QUESTION') AS questions, SUM(kind = 'NOTE') AS notes, SUM(kind = 'FLASHCARD_DECK') AS decks, SUM(kind = 'VIDEO') AS videos
     FROM items WHERE exam_code = ? GROUP BY subject_id, subject_name ORDER BY subject_name`,
    examCode,
  );
}

export async function itemsFor(subjectId: string, kind?: ItemRow['kind'], topicId?: string): Promise<ItemRow[]> {
  const db = await getDb();
  const where = ['subject_id = ?'];
  const args: (string | null)[] = [subjectId];
  if (kind) {
    where.push('kind = ?');
    args.push(kind);
  }
  if (topicId) {
    where.push('topic_id = ?');
    args.push(topicId);
  }
  return db.getAllAsync<ItemRow>(`SELECT * FROM items WHERE ${where.join(' AND ')} ORDER BY topic_name, title`, ...args);
}

export async function item(id: string): Promise<ItemRow | null> {
  const db = await getDb();
  return db.getFirstAsync<ItemRow>('SELECT * FROM items WHERE id = ?', id);
}

/** Random questions for a mock, spread across subjects. */
export async function mockQuestions(examCode: ExamCode, count: number, subjectIds?: string[]): Promise<ItemRow[]> {
  const db = await getDb();
  if (subjectIds?.length) {
    const marks = subjectIds.map(() => '?').join(',');
    return db.getAllAsync<ItemRow>(`SELECT * FROM items WHERE exam_code = ? AND kind = 'QUESTION' AND subject_id IN (${marks}) ORDER BY RANDOM() LIMIT ?`, examCode, ...subjectIds, count);
  }
  return db.getAllAsync<ItemRow>(`SELECT * FROM items WHERE exam_code = ? AND kind = 'QUESTION' ORDER BY RANDOM() LIMIT ?`, examCode, count);
}
