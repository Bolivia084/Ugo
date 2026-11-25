import { lagosDay, streak } from './progress.service.js';

describe('daily streak', () => {
  const now = new Date('2026-06-10T10:00:00Z');
  it('counts consecutive Lagos days including today', () => {
    expect(streak(new Set(['2026-06-10', '2026-06-09', '2026-06-08', '2026-06-06']), now)).toBe(3);
  });
  it('still counts yesterday when nothing yet today', () => {
    expect(streak(new Set(['2026-06-09', '2026-06-08']), now)).toBe(2);
  });
  it('uses Lagos time (UTC+1) for the day boundary', () => {
    expect(lagosDay(new Date('2026-06-09T23:30:00Z'))).toBe('2026-06-10');
  });
});
