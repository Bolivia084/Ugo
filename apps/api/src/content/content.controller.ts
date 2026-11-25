import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import type { ExamCode } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminIpGuard } from '../common/admin-ip.guard.js';
import { AdminAuditInterceptor } from '../common/audit.interceptor.js';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public, Roles } from '../common/decorators.js';
import { EntitlementsService } from '../billing/entitlements.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { createItemSchema, publishSchema, reviewSchema, scheduleSchema, updateItemSchema, type CreateItem } from './content.schemas.js';
import { ContentService } from './content.service.js';
import { StorageService } from './storage.service.js';

const examCodeSchema = z.enum(['FSLC', 'COMMON_ENTRANCE', 'BECE', 'WAEC', 'NECO', 'JAMB', 'SAT', 'IELTS']);

/** What the app calls: which pack to download, and media links. */
@Controller('content')
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly storage: StorageService,
    private readonly entitlements: EntitlementsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Free users get the sample pack; plan holders get the full pack. The link expires after an hour. */
  @Get('packs/:examCode')
  async manifest(@CurrentUser() user: AuthUser, @Param('examCode', { schema: examCodeSchema }) examCode: ExamCode) {
    const paid = await this.entitlements.hasAccess(user.id, examCode);
    const pack = await this.content.currentPack(examCode, !paid);
    if (!pack) throw new NotFoundException('No content published for this exam yet');
    return {
      examCode,
      version: pack.version,
      isSampleOnly: pack.isSampleOnly,
      publishedAt: pack.publishedAt.toISOString(),
      sizeBytes: pack.sizeBytes,
      sha256: pack.sha256,
      whatsNew: pack.whatsNew,
      url: await this.storage.signedUrl(pack.storageKey, 3600),
    };
  }

  /** Development only: serves files from local storage when the link's signature is valid. */
  @Public()
  @Get('files')
  async file(@Query('key') key: string, @Query('expires') expires: string, @Query('sig') sig: string, @Res() res: Response) {
    if (!key || !sig || !this.storage.verifyLocalSignature(key, Number(expires), sig)) throw new ForbiddenException('Link expired');
    const body = await this.storage.get(key).catch(() => null);
    if (!body) throw new NotFoundException();
    res.setHeader('Content-Type', key.endsWith('.gz') ? 'application/gzip' : 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(body);
  }

  /** Streaming access to a video: signed cookies for every HLS segment, valid for four hours. */
  @Get('videos/:id/access')
  async video(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const item = await this.prisma.contentItem.findUnique({ where: { id }, include: { examCategory: { select: { code: true } } } });
    if (!item || item.kind !== 'VIDEO' || item.status !== 'PUBLISHED') throw new NotFoundException();
    if (!item.isSample && !(await this.entitlements.hasAccess(user.id, item.examCategory.code))) throw new ForbiddenException({ message: 'Get a plan to watch this lesson', code: 'PLAN_REQUIRED' });
    const p = item.payload as { hlsPrefix: string; downloadKey?: string };
    return {
      streamUrl: this.storage.publicUrl(`${p.hlsPrefix}index.m3u8`),
      cookies: this.storage.signedCookiesForPrefix(p.hlsPrefix),
      downloadUrl: p.downloadKey ? await this.storage.signedUrl(p.downloadKey, 3600) : null,
    };
  }
}

const listQuery = z.object({
  examCode: examCodeSchema.optional(),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).optional(),
  kind: z.enum(['QUESTION', 'NOTE', 'FLASHCARD_DECK', 'VIDEO']).optional(),
  subjectId: z.uuid().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Admin dashboard: the content workflow. */
@Controller('admin/content')
@Roles('CONTENT_STAFF', 'ADMIN')
@UseGuards(AdminIpGuard)
@UseInterceptors(AdminAuditInterceptor)
export class ContentAdminController {
  constructor(private readonly content: ContentService) {}

  @Get('items')
  async list(@Query({ schema: listQuery }) q: z.infer<typeof listQuery>) {
    const rows = await this.content.list(q);
    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit);
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  @Get('items/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.content.get(id);
  }

  @Post('items')
  create(@CurrentUser() u: AuthUser, @Body({ schema: createItemSchema }) body: CreateItem) {
    return this.content.create(u, body);
  }

  @Patch('items/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body({ schema: updateItemSchema }) body: z.infer<typeof updateItemSchema>) {
    return this.content.update(u, id, body);
  }

  @Post('items/:id/duplicate')
  duplicate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.duplicate(u, id);
  }

  @Post('items/:id/submit')
  @HttpCode(200)
  submit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.submit(u, id);
  }

  @Post('items/:id/review')
  @HttpCode(200)
  review(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body({ schema: reviewSchema }) body: z.infer<typeof reviewSchema>) {
    return this.content.review(u, id, body.approved, body.comment);
  }

  @Post('items/:id/schedule')
  @HttpCode(200)
  schedule(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body({ schema: scheduleSchema }) body: z.infer<typeof scheduleSchema>) {
    const at = new Date(body.publishAt);
    if (at.getTime() < Date.now() - 60_000) throw new BadRequestException('Pick a time in the future');
    return this.content.schedule(u, id, at);
  }

  @Post('items/:id/archive')
  @HttpCode(200)
  archive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.archive(u, id);
  }

  @Get('packs/:examCode')
  packs(@Param('examCode', { schema: examCodeSchema }) examCode: ExamCode) {
    return this.content.listPacks(examCode);
  }

  @Roles('ADMIN', 'CONTENT_STAFF')
  @Post('packs/:examCode/publish')
  publish(@CurrentUser() u: AuthUser, @Param('examCode', { schema: examCodeSchema }) examCode: ExamCode, @Body({ schema: publishSchema }) body: z.infer<typeof publishSchema>) {
    return this.content.publishPack(examCode, body.whatsNew, u.id);
  }

  @Roles('ADMIN')
  @Post('packs/:examCode/rollback')
  @HttpCode(200)
  rollback(@CurrentUser() u: AuthUser, @Param('examCode', { schema: examCodeSchema }) examCode: ExamCode) {
    return this.content.rollbackPack(examCode, u.id);
  }
}
