import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { FREE_SAMPLE_MOCK_MINUTES, FREE_SAMPLE_MOCK_QUESTIONS, FREE_SAMPLE_QUESTIONS_PER_SUBJECT } from '@ugo/shared';
import { PrismaService } from '../prisma/prisma.service.js';

export const SETTING_DEFAULTS = {
  minSupportedVersion: '1.0.0',
  latestVersion: '1.0.0',
  maintenanceMessage: null as string | null,
  freeSampleQuestionsPerSubject: FREE_SAMPLE_QUESTIONS_PER_SUBJECT,
  freeSampleMockQuestions: FREE_SAMPLE_MOCK_QUESTIONS,
  freeSampleMockMinutes: FREE_SAMPLE_MOCK_MINUTES,
  /** Days of notice before a price change applies to renewals. Check each store's current rule before changing a price. */
  priceChangeNoticeDays: 30,
  /** Whether the apps may mention web checkout. Keep false unless store rules for Nigeria allow it. */
  showWebCheckoutInApp: false,
};
export type SettingKey = keyof typeof SETTING_DEFAULTS;

/** Settings staff change from the admin dashboard, without an app release. */
@Injectable()
export class SettingsService {
  private cache: { at: number; values: typeof SETTING_DEFAULTS } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async all(): Promise<typeof SETTING_DEFAULTS> {
    if (this.cache && Date.now() - this.cache.at < 30_000) return this.cache.values;
    const rows = await this.prisma.setting.findMany();
    const values = { ...SETTING_DEFAULTS };
    for (const r of rows) if (r.key in values) (values as Record<string, unknown>)[r.key] = r.value;
    this.cache = { at: Date.now(), values };
    return values;
  }

  async get<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
    return (await this.all())[key];
  }

  async set(key: SettingKey, value: unknown): Promise<void> {
    await this.prisma.setting.upsert({ where: { key }, create: { key, value: value as Prisma.InputJsonValue }, update: { value: value as Prisma.InputJsonValue } });
    this.cache = null;
  }
}
