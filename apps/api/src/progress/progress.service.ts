import { Injectable } from '@nestjs/common';
import type { AttemptMode, ExamCode, Prisma } from '@prisma/client';
import { scoreAttempt, type Question } from '@ugo/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContentService } from '../content/content.service.js';

export interface SyncAttempt {
  clientId: string;
  examCode: ExamCode;
  subjectId?: string;
  mode: AttemptMode;
  startedAt: string;
  finishedAt: string;
  answers: { questionId: string; chosen: string | null; timeSpentMs: number }[];
}

const LAGOS_OFFSET_MS = 60 * 60_000; // West Africa Time, UTC+1, no daylight saving

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
  ) {}

  /**
   * Saves attempts made offline. Each attempt carries a client generated id, so sending the
   * same batch twice never creates duplicates. Scores are recalculated here from the stored answers.
   */
  async syncAttempts(userId: string, attempts: SyncAttempt[]) {
    const accepted: string[] = [];
    const ids = [...new Set(attempts.flatMap((a) => a.answers.map((x) => x.questionId)))];
    const items = await this.content.questionsForScoring(ids);
    const byId = new Map(items.map((i) => [i.id, i]));

    for (const a of attempts) {
      const questions: Question[] = a.answers
        .map((ans) => byId.get(ans.questionId))
        .filter((i): i is NonNullable<typeof i> => Boolean(i) && i!.examCategory.code === a.examCode)
        .map((i) => {
          const p = i.payload as { type: Question['type']; body: string; answer?: string; explanation: string };
          return { id: i.id, examCode: a.examCode, subjectId: i.subjectId, topicId: i.topicId ?? i.subjectId, topicName: i.topic?.name ?? undefined, type: p.type, body: p.body, answer: p.answer ?? null, explanation: p.explanation, isSample: i.isSample };
        });
      const result = scoreAttempt(questions, a.answers);
      const started = new Date(a.startedAt);
      const finished = new Date(a.finishedAt);
      await this.prisma.attempt.upsert({
        where: { userId_clientId: { userId, clientId: a.clientId } },
        create: {
          userId,
          clientId: a.clientId,
          examCode: a.examCode,
          subjectId: a.subjectId,
          mode: a.mode,
          startedAt: started,
          finishedAt: finished < started ? started : finished,
          score: result.score,
          markable: result.markable,
          percentage: result.percentage,
          totalTimeMs: Math.min(result.totalTimeMs, 6 * 3600_000),
          answers: a.answers as unknown as Prisma.InputJsonValue,
          topicResults: result.topics as unknown as Prisma.InputJsonValue,
        },
        update: {}, // already stored: keep the first copy
      });
      accepted.push(a.clientId);
    }
    return { accepted };
  }

  async syncFlashcards(userId: string, cards: { clientId: string; deckName: string; front: string; back: string; updatedAt: string; deleted?: boolean }[]) {
    for (const c of cards) {
      const updatedAt = new Date(c.updatedAt);
      const existing = await this.prisma.customFlashcard.findUnique({ where: { userId_clientId: { userId, clientId: c.clientId } } });
      if (existing && existing.updatedAt >= updatedAt) continue; // last write wins
      await this.prisma.customFlashcard.upsert({
        where: { userId_clientId: { userId, clientId: c.clientId } },
        create: { userId, clientId: c.clientId, deckName: c.deckName, front: c.front, back: c.back, updatedAt, deletedAt: c.deleted ? updatedAt : null },
        update: { deckName: c.deckName, front: c.front, back: c.back, updatedAt, deletedAt: c.deleted ? updatedAt : null },
      });
    }
    const all = await this.prisma.customFlashcard.findMany({ where: { userId }, orderBy: { updatedAt: 'asc' } });
    return all.map((c) => ({ clientId: c.clientId, deckName: c.deckName, front: c.front, back: c.back, updatedAt: c.updatedAt.toISOString(), deleted: Boolean(c.deletedAt) }));
  }

  /** Score trends, per subject averages, practice frequency, study time and the daily streak. */
  async summary(userId: string, now = new Date()) {
    const since = new Date(now.getTime() - 90 * 86_400_000);
    const attempts = await this.prisma.attempt.findMany({ where: { userId, finishedAt: { gte: since } }, orderBy: { finishedAt: 'asc' } });
    const subjectIds = [...new Set(attempts.map((a) => a.subjectId).filter(Boolean))] as string[];
    const subjects = await this.prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true } });
    const subjectName = new Map(subjects.map((s) => [s.id, s.name]));

    const days = new Map<string, { attempts: number; minutes: number; avg: number; sum: number }>();
    const perSubject = new Map<string, { name: string; examCode: string; attempts: number; sum: number }>();
    const topicTotals = new Map<string, { topicId: string; topicName: string; correct: number; total: number }>();
    for (const a of attempts) {
      const day = lagosDay(a.finishedAt);
      const d = days.get(day) ?? { attempts: 0, minutes: 0, avg: 0, sum: 0 };
      d.attempts += 1;
      d.minutes += Math.round(a.totalTimeMs / 60_000);
      d.sum += a.percentage;
      d.avg = Math.round((d.sum / d.attempts) * 10) / 10;
      days.set(day, d);
      const key = a.subjectId ?? `${a.examCode}:mixed`;
      const s = perSubject.get(key) ?? { name: a.subjectId ? subjectName.get(a.subjectId) ?? 'Subject' : 'Mixed', examCode: a.examCode, attempts: 0, sum: 0 };
      s.attempts += 1;
      s.sum += a.percentage;
      perSubject.set(key, s);
      for (const t of (a.topicResults as unknown as { topicId: string; topicName: string; correct: number; total: number }[]) ?? []) {
        const tt = topicTotals.get(t.topicId) ?? { topicId: t.topicId, topicName: t.topicName, correct: 0, total: 0 };
        tt.correct += t.correct;
        tt.total += t.total;
        topicTotals.set(t.topicId, tt);
      }
    }
    const weakTopics = [...topicTotals.values()]
      .filter((t) => t.total >= 3)
      .map((t) => ({ ...t, percentage: Math.round((t.correct / t.total) * 1000) / 10 }))
      .sort((a, b) => a.percentage - b.percentage)
      .slice(0, 5);

    return {
      streakDays: streak(new Set(days.keys()), now),
      totalAttempts: attempts.length,
      minutesLast7Days: [...days.entries()].filter(([d]) => d >= lagosDay(new Date(now.getTime() - 6 * 86_400_000))).reduce((s, [, v]) => s + v.minutes, 0),
      daily: [...days.entries()].map(([date, v]) => ({ date, attempts: v.attempts, minutes: v.minutes, averagePercentage: v.avg })),
      subjects: [...perSubject.entries()].map(([id, s]) => ({ id, name: s.name, examCode: s.examCode, attempts: s.attempts, averagePercentage: Math.round((s.sum / s.attempts) * 10) / 10 })),
      weakTopics,
      recentMocks: attempts.filter((a) => a.mode !== 'PRACTICE').slice(-10).reverse().map((a) => ({ id: a.id, examCode: a.examCode, percentage: a.percentage, finishedAt: a.finishedAt })),
    };
  }

  /** Display names only, opted in learners only, best average of mock exams in the last 30 days. */
  async leaderboard(examCode: ExamCode, now = new Date()) {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const rows = await this.prisma.attempt.groupBy({
      by: ['userId'],
      where: { examCode, mode: 'MOCK', finishedAt: { gte: since }, user: { leaderboardOptIn: true, status: 'ACTIVE' } },
      _avg: { percentage: true },
      _count: { _all: true },
      having: { percentage: { _count: { gte: 2 } } },
      orderBy: { _avg: { percentage: 'desc' } },
      take: 50,
    });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true } });
    const names = new Map(users.map((u) => [u.id, u.displayName]));
    return rows.map((r, i) => ({ rank: i + 1, displayName: names.get(r.userId) ?? 'Learner', averagePercentage: Math.round((r._avg.percentage ?? 0) * 10) / 10, mocks: r._count._all, userId: r.userId }));
  }
}

export function lagosDay(d: Date): string {
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Consecutive days with study, counting today or, if nothing yet today, ending yesterday. */
export function streak(activeDays: Set<string>, now = new Date()): number {
  let count = 0;
  let cursor = new Date(now.getTime());
  if (!activeDays.has(lagosDay(cursor))) cursor = new Date(cursor.getTime() - 86_400_000);
  while (activeDays.has(lagosDay(cursor))) {
    count += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return count;
}
