import type { AnswerRecord, Question } from './types';

export interface TopicResult {
  topicId: string;
  topicName: string;
  correct: number;
  total: number;
  percentage: number;
}

export interface AttemptResult {
  score: number;
  /** Questions that can be auto marked (essays are excluded). */
  markable: number;
  percentage: number;
  totalTimeMs: number;
  averageTimeMs: number;
  perQuestion: { questionId: string; correct: boolean | null; timeSpentMs: number }[];
  topics: TopicResult[];
  /** Topics under the weak threshold, weakest first. */
  weakTopics: TopicResult[];
  /** Up to three topics to study next. */
  recommendedTopics: TopicResult[];
  essaysPendingReview: number;
}

export const WEAK_TOPIC_THRESHOLD = 60;

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Returns true, false, or null when the question cannot be auto marked. */
export function isCorrect(question: Question, chosen: string | null): boolean | null {
  if (question.type === 'ESSAY' || question.answer == null) return null;
  if (chosen == null || chosen.trim() === '') return false;
  if (question.type === 'MULTIPLE_CHOICE') return normalise(chosen) === normalise(question.answer);
  return question.answer
    .split('|')
    .map(normalise)
    .includes(normalise(chosen));
}

export function scoreAttempt(questions: Question[], answers: AnswerRecord[]): AttemptResult {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const topicMap = new Map<string, TopicResult>();
  const perQuestion: AttemptResult['perQuestion'] = [];
  let score = 0;
  let markable = 0;
  let totalTimeMs = 0;
  let essaysPendingReview = 0;

  for (const q of questions) {
    const a = byId.get(q.id);
    const timeSpentMs = Math.max(0, a?.timeSpentMs ?? 0);
    totalTimeMs += timeSpentMs;
    const correct = isCorrect(q, a?.chosen ?? null);
    perQuestion.push({ questionId: q.id, correct, timeSpentMs });
    if (correct === null) {
      essaysPendingReview += 1;
      continue;
    }
    markable += 1;
    if (correct) score += 1;
    const t = topicMap.get(q.topicId) ?? {
      topicId: q.topicId,
      topicName: q.topicName ?? q.topicId,
      correct: 0,
      total: 0,
      percentage: 0,
    };
    t.total += 1;
    if (correct) t.correct += 1;
    topicMap.set(q.topicId, t);
  }

  const topics = [...topicMap.values()].map((t) => ({ ...t, percentage: pct(t.correct, t.total) }));
  const weakTopics = topics
    .filter((t) => t.percentage < WEAK_TOPIC_THRESHOLD)
    .sort((a, b) => a.percentage - b.percentage || b.total - a.total);
  const recommendedTopics = (weakTopics.length ? weakTopics : [...topics].sort((a, b) => a.percentage - b.percentage)).slice(0, 3);

  return {
    score,
    markable,
    percentage: pct(score, markable),
    totalTimeMs,
    averageTimeMs: questions.length ? Math.round(totalTimeMs / questions.length) : 0,
    perQuestion,
    topics,
    weakTopics,
    recommendedTopics,
    essaysPendingReview,
  };
}

function pct(n: number, d: number): number {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}
