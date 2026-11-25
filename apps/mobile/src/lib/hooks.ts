import { useQuery } from '@tanstack/react-query';
import type { ExamCode } from '@ugo/shared';
import { api } from './api';
import { kvGet, kvSet } from './db';

export interface CatalogExam {
  code: ExamCode;
  name: string;
  level: string;
  description: string;
  minAge: number;
  disclaimer: string | null;
  electiveCount: number | null;
  mockMinutes: number;
  mockSections: { name: string; durationMinutes: number; questionCount: number }[];
  webPriceKobo: number;
  appleProductId: string | null;
  googleProductId: string | null;
  subjects: { id: string; name: string; slug: string; topics: { id: string; name: string }[] }[];
}

/** The catalogue comes from the server (staff edit it) and is cached on the phone for offline use. */
export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      try {
        const data = await api<CatalogExam[]>('/catalog', { auth: false });
        await kvSet('catalog', data);
        return data;
      } catch (e) {
        const cached = await kvGet<CatalogExam[]>('catalog');
        if (cached) return cached;
        throw e;
      }
    },
    staleTime: 60 * 60_000,
  });
}

export interface ProgressSummary {
  streakDays: number;
  totalAttempts: number;
  minutesLast7Days: number;
  daily: { date: string; attempts: number; minutes: number; averagePercentage: number }[];
  subjects: { id: string; name: string; examCode: string; attempts: number; averagePercentage: number }[];
  weakTopics: { topicId: string; topicName: string; percentage: number; total: number }[];
  recentMocks: { id: string; examCode: string; percentage: number; finishedAt: string }[];
}

export function useProgress() {
  return useQuery({
    queryKey: ['progress'],
    queryFn: async () => {
      try {
        const data = await api<ProgressSummary>('/progress/summary');
        await kvSet('progress', data);
        return data;
      } catch (e) {
        const cached = await kvGet<ProgressSummary>('progress');
        if (cached) return cached;
        throw e;
      }
    },
  });
}
