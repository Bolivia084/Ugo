import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import type { ExamCode } from '@prisma/client';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProgressService } from './progress.service.js';

const examCode = z.enum(['FSLC', 'COMMON_ENTRANCE', 'BECE', 'WAEC', 'NECO', 'JAMB', 'SAT', 'IELTS']);
const syncSchema = z
  .object({
    attempts: z
      .array(
        z.object({
          clientId: z.string().min(8).max(64),
          examCode,
          subjectId: z.uuid().optional(),
          mode: z.enum(['PRACTICE', 'MOCK', 'SAMPLE_MOCK']),
          startedAt: z.iso.datetime(),
          finishedAt: z.iso.datetime(),
          answers: z.array(z.object({ questionId: z.uuid(), chosen: z.string().max(10_000).nullable(), timeSpentMs: z.number().int().min(0).max(6 * 3600_000) })).max(250),
        }),
      )
      .max(100)
      .default([]),
    flashcards: z
      .array(z.object({ clientId: z.string().min(8).max(64), deckName: z.string().min(1).max(80), front: z.string().min(1).max(500), back: z.string().min(1).max(2000), updatedAt: z.iso.datetime(), deleted: z.boolean().optional() }))
      .max(500)
      .default([]),
  })
  .strict();

@Controller()
export class ProgressController {
  constructor(
    private readonly progress: ProgressService,
    private readonly prisma: PrismaService,
  ) {}

  /** Offline sync. Safe to repeat: results are never lost or doubled. */
  @Post('sync')
  @HttpCode(200)
  async sync(@CurrentUser() user: AuthUser, @Body({ schema: syncSchema }) body: z.infer<typeof syncSchema>) {
    const attempts = await this.progress.syncAttempts(user.id, body.attempts);
    const flashcards = await this.progress.syncFlashcards(user.id, body.flashcards);
    return { ...attempts, flashcards };
  }

  @Get('progress/summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.progress.summary(user.id);
  }

  @Get('leaderboard/:examCode')
  async leaderboard(@CurrentUser() user: AuthUser, @Param('examCode', { schema: examCode }) code: ExamCode) {
    const rows = await this.progress.leaderboard(code);
    return rows.map(({ userId, ...r }) => ({ ...r, isMe: userId === user.id }));
  }

  @Get('bookmarks')
  async bookmarks(@CurrentUser() user: AuthUser) {
    return (await this.prisma.bookmark.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })).map((b) => b.itemId);
  }

  @Put('bookmarks/:itemId')
  @HttpCode(204)
  async addBookmark(@CurrentUser() user: AuthUser, @Param('itemId', ParseUUIDPipe) itemId: string) {
    await this.prisma.bookmark.upsert({ where: { userId_itemId: { userId: user.id, itemId } }, create: { userId: user.id, itemId }, update: {} });
  }

  @Delete('bookmarks/:itemId')
  @HttpCode(204)
  async removeBookmark(@CurrentUser() user: AuthUser, @Param('itemId', ParseUUIDPipe) itemId: string) {
    await this.prisma.bookmark.deleteMany({ where: { userId: user.id, itemId } });
  }

  /** A parent's view of one linked child: progress, plans and AI tutor use. */
  @Roles('PARENT')
  @Get('parents/children/:id/progress')
  async childProgress(@CurrentUser() parent: AuthUser, @Param('id', ParseUUIDPipe) childId: string) {
    const link = await this.prisma.parentLink.findUnique({ where: { parentId_childId: { parentId: parent.id, childId } } });
    if (link?.status !== 'ACTIVE') throw new NotFoundException('Child not found');
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [summary, tutor, plans] = await Promise.all([
      this.progress.summary(childId),
      this.prisma.tutorUsage.findMany({ where: { userId: childId, day: { gte: since } }, orderBy: { day: 'asc' } }),
      this.prisma.entitlement.findMany({ where: { userId: childId }, select: { examCode: true, status: true, expiresAt: true, source: true } }),
    ]);
    return {
      summary,
      plans,
      tutorUsage: tutor.map((t) => ({ date: t.day.toISOString().slice(0, 10), messages: t.messages, declined: t.refusals })),
    };
  }
}
