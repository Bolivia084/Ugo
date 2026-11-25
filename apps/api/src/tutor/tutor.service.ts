import { ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import type { ExamCode } from '@prisma/client';
import { ageOn } from '@ugo/shared';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ageBand, learnerContext, redactPersonalDetails, TUTOR_SYSTEM_PROMPT } from './tutor.prompt.js';

export interface TutorTurn {
  role: 'user' | 'assistant';
  content: string;
}

const DECLINE_MESSAGE = "I can't help with that one. Let's get back to your studies: tell me a question or topic you're working on.";

/**
 * The AI tutor. Every call goes through this service: the provider key stays on the server,
 * paid plans get a daily fair use limit, and parents can see how much it is used.
 */
@Injectable()
export class TutorService {
  private readonly logger = new Logger(TutorService.name);
  private readonly client: Anthropic | null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {
    this.client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 }) : null;
  }

  async usage(userId: string) {
    const limit = await this.dailyLimit(userId);
    const row = await this.prisma.tutorUsage.findUnique({ where: { userId_day: { userId, day: today() } } });
    return { used: row?.messages ?? 0, limit };
  }

  async reply(userId: string, history: TutorTurn[], examCode?: ExamCode) {
    if (!this.client) throw new ServiceUnavailableException('The tutor is not available right now');
    const limit = await this.dailyLimit(userId);
    if (limit === 0) throw new ForbiddenException({ message: 'The AI tutor comes with any Ugo plan', code: 'PLAN_REQUIRED' });
    await this.claimMessage(userId, limit);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { dateOfBirth: true } });
    const weakTopics = await this.weakTopics(userId, examCode);
    const messages: Anthropic.Beta.BetaMessageParam[] = history.slice(-20).map((t) => ({ role: t.role, content: t.role === 'user' ? redactPersonalDetails(t.content) : t.content }));

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.env.TUTOR_MODEL,
        max_tokens: 16000,
        // Server side fallback: if the model declines on a safety category, the API retries on a suitable model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        // Chat replies do not need deep reasoning; low effort keeps answers fast and cheaper.
        output_config: { effort: 'low' },
        system: [
          { type: 'text', text: TUTOR_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: learnerContext({ ageBand: ageBand(user.dateOfBirth ? ageOn(user.dateOfBirth) : null), examCode, weakTopics }) },
        ],
        messages,
      });
    } catch (e) {
      await this.releaseMessage(userId);
      if (e instanceof Anthropic.RateLimitError) throw new HttpException('The tutor is busy. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
      if (e instanceof Anthropic.APIError) {
        this.logger.error(`Tutor API error ${e.status}`);
        throw new ServiceUnavailableException('The tutor is not available right now');
      }
      throw e;
    }

    if (response.stop_reason === 'refusal') {
      await this.prisma.tutorUsage.update({ where: { userId_day: { userId, day: today() } }, data: { refusals: { increment: 1 } } });
      return { reply: DECLINE_MESSAGE, declined: true, ...(await this.usage(userId)) };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const truncated = response.stop_reason === 'max_tokens';
    return { reply: text || DECLINE_MESSAGE, declined: false, truncated, ...(await this.usage(userId)) };
  }

  /** The highest daily limit among the user's active plans; 0 on the free level. */
  private async dailyLimit(userId: string): Promise<number> {
    const codes = await this.entitlements.activeCodes(userId);
    if (!codes.length) return 0;
    const cats = await this.prisma.examCategory.findMany({ where: { code: { in: codes } }, select: { tutorDailyLimit: true } });
    return Math.max(0, ...cats.map((c) => c.tutorDailyLimit));
  }

  private async claimMessage(userId: string, limit: number) {
    const day = today();
    await this.prisma.tutorUsage.upsert({ where: { userId_day: { userId, day } }, create: { userId, day, messages: 0 }, update: {} });
    const claimed = await this.prisma.tutorUsage.updateMany({ where: { userId, day, messages: { lt: limit } }, data: { messages: { increment: 1 } } });
    if (claimed.count !== 1) {
      throw new HttpException({ message: `You have used today's ${limit} tutor messages. They reset at midnight.`, code: 'TUTOR_LIMIT' }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async releaseMessage(userId: string) {
    await this.prisma.tutorUsage.updateMany({ where: { userId, day: today(), messages: { gt: 0 } }, data: { messages: { decrement: 1 } } });
  }

  private async weakTopics(userId: string, examCode?: ExamCode): Promise<string[]> {
    const attempts = await this.prisma.attempt.findMany({ where: { userId, ...(examCode ? { examCode } : {}) }, orderBy: { finishedAt: 'desc' }, take: 20, select: { topicResults: true } });
    const totals = new Map<string, { name: string; correct: number; total: number }>();
    for (const a of attempts) {
      for (const t of (a.topicResults as unknown as { topicId: string; topicName: string; correct: number; total: number }[]) ?? []) {
        const x = totals.get(t.topicId) ?? { name: t.topicName, correct: 0, total: 0 };
        x.correct += t.correct;
        x.total += t.total;
        totals.set(t.topicId, x);
      }
    }
    return [...totals.values()]
      .filter((t) => t.total >= 3 && t.correct / t.total < 0.6)
      .sort((a, b) => a.correct / a.total - b.correct / b.total)
      .slice(0, 5)
      .map((t) => t.name);
  }
}

/** The calendar day in Lagos (UTC+1), so limits reset at local midnight. */
function today(): Date {
  return new Date(new Date(Date.now() + 3600_000).toISOString().slice(0, 10));
}
