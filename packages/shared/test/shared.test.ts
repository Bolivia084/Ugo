import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addOneYear,
  ageOn,
  canJoinLeaderboard,
  compareVersions,
  EXAM_CATALOG,
  hasAccess,
  isCorrect,
  isDueForRenewalReminder,
  leaderboardDefaultOn,
  mockDurationMinutes,
  mustUpdate,
  scoreAttempt,
  type Question,
} from '../src';

const q = (id: string, topicId: string, answer: string | null, type: Question['type'] = 'MULTIPLE_CHOICE'): Question => ({
  id,
  examCode: 'WAEC',
  subjectId: 's1',
  topicId,
  topicName: topicId,
  type,
  body: 'b',
  answer,
  explanation: 'e',
  isSample: false,
});

test('catalogue has all eight exams with the specified prices', () => {
  const prices = Object.fromEntries(EXAM_CATALOG.map((e) => [e.code, e.defaultPriceKobo / 100]));
  assert.deepEqual(prices, {
    FSLC: 5000, COMMON_ENTRANCE: 5000, BECE: 5000, WAEC: 7000, NECO: 7000, JAMB: 7000, SAT: 7000, IELTS: 7000,
  });
  assert.equal(EXAM_CATALOG.find((e) => e.code === 'BECE')!.subjects.length, 15);
});

test('JAMB mock is 120 minutes', () => {
  assert.equal(mockDurationMinutes('JAMB'), 120);
});

test('scoring handles multiple choice, short answer and essays', () => {
  const questions = [q('1', 'algebra', 'A'), q('2', 'algebra', 'B'), q('3', 'geometry', 'x = 2|2', 'SHORT_ANSWER'), q('4', 'essay', null, 'ESSAY')];
  const r = scoreAttempt(questions, [
    { questionId: '1', chosen: 'a', timeSpentMs: 1000 },
    { questionId: '2', chosen: 'C', timeSpentMs: 2000 },
    { questionId: '3', chosen: ' 2 ', timeSpentMs: 3000 },
  ]);
  assert.equal(r.score, 2);
  assert.equal(r.markable, 3);
  assert.equal(r.percentage, 66.7);
  assert.equal(r.essaysPendingReview, 1);
  assert.deepEqual(r.weakTopics.map((t) => t.topicId), ['algebra']);
  assert.equal(r.totalTimeMs, 6000);
  assert.equal(isCorrect(q('5', 't', 'A'), null), false);
});

test('entitlements: access until expiry, several plans at once', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  const ents = [
    { examCode: 'WAEC' as const, status: 'ACTIVE' as const, expiresAt: '2027-01-01T00:00:00Z' },
    { examCode: 'JAMB' as const, status: 'CANCELLED' as const, expiresAt: '2026-07-01T00:00:00Z' },
    { examCode: 'SAT' as const, status: 'REFUNDED' as const, expiresAt: '2027-01-01T00:00:00Z' },
    { examCode: 'BECE' as const, status: 'ACTIVE' as const, expiresAt: '2026-05-01T00:00:00Z' },
  ];
  assert.equal(hasAccess(ents, 'WAEC', now), true);
  assert.equal(hasAccess(ents, 'JAMB', now), true);
  assert.equal(hasAccess(ents, 'SAT', now), false);
  assert.equal(hasAccess(ents, 'BECE', now), false);
});

test('addOneYear clamps leap days', () => {
  assert.equal(addOneYear(new Date('2028-02-29T10:00:00Z')).toISOString(), '2029-02-28T10:00:00.000Z');
  assert.equal(addOneYear(new Date('2026-11-24T10:00:00Z')).toISOString(), '2027-11-24T10:00:00.000Z');
});

test('renewal reminder fires within 7 days', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  assert.equal(isDueForRenewalReminder({ status: 'ACTIVE', autoRenew: true, expiresAt: '2026-06-05T00:00:00Z' }, now), true);
  assert.equal(isDueForRenewalReminder({ status: 'ACTIVE', autoRenew: true, expiresAt: '2026-06-20T00:00:00Z' }, now), false);
  assert.equal(isDueForRenewalReminder({ status: 'CANCELLED', autoRenew: false, expiresAt: '2026-06-05T00:00:00Z' }, now), false);
});

test('age and leaderboard rules', () => {
  const now = new Date('2026-06-01T00:00:00Z');
  assert.equal(ageOn('2014-06-02', now), 11);
  assert.equal(leaderboardDefaultOn('2014-06-02', now), false);
  assert.equal(canJoinLeaderboard('2014-06-02', false, now), false);
  assert.equal(canJoinLeaderboard('2014-06-02', true, now), true);
  assert.equal(leaderboardDefaultOn('2010-01-01', now), true);
});

test('version checks', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(mustUpdate('1.2.0', '1.2.1'), true);
  assert.equal(mustUpdate('1.2.1', '1.2.1'), false);
});
