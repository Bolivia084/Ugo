import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ContentItem, ContentStatus, ExamCode, Prisma, Role } from '@prisma/client';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type CreateItem, payloadByKind, type updateItemSchema } from './content.schemas.js';
import { StorageService } from './storage.service.js';
import type { z } from 'zod';

const REVIEWER_ROLES: Role[] = ['CONTENT_STAFF', 'ADMIN'];

/**
 * Content workflow: DRAFT -> IN_REVIEW -> APPROVED -> (SCHEDULED) -> PUBLISHED.
 * A reviewer cannot approve their own item. Published content ships in versioned packs,
 * and a bad pack can be rolled back to the previous version.
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  list(filter: { examCode?: ExamCode; status?: ContentStatus; kind?: ContentItem['kind']; subjectId?: string; cursor?: string; limit: number }) {
    return this.prisma.contentItem.findMany({
      where: {
        ...(filter.examCode ? { examCategory: { code: filter.examCode } } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.kind ? { kind: filter.kind } : {}),
        ...(filter.subjectId ? { subjectId: filter.subjectId } : {}),
      },
      orderBy: { id: 'asc' },
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: { subject: { select: { name: true } }, topic: { select: { name: true } }, examCategory: { select: { code: true } } },
    });
  }

  async get(id: string) {
    const item = await this.prisma.contentItem.findUnique({ where: { id }, include: { reviews: { orderBy: { createdAt: 'desc' } } } });
    if (!item) throw new NotFoundException('Content not found');
    return item;
  }

  async create(actor: AuthUser, input: CreateItem) {
    const payload = this.validatePayload(input.kind, input.payload);
    this.checkRights(input);
    const cat = await this.prisma.examCategory.findUniqueOrThrow({ where: { code: input.examCode } });
    const subject = await this.prisma.subject.findFirst({ where: { id: input.subjectId, examCategoryId: cat.id } });
    if (!subject) throw new BadRequestException('Subject does not belong to this exam');
    if (input.topicId && !(await this.prisma.topic.findFirst({ where: { id: input.topicId, subjectId: subject.id } }))) throw new BadRequestException('Topic does not belong to this subject');
    return this.prisma.contentItem.create({
      data: {
        kind: input.kind,
        examCategoryId: cat.id,
        subjectId: subject.id,
        topicId: input.topicId,
        title: input.title,
        payload: payload as Prisma.InputJsonValue,
        year: input.year,
        isSample: input.isSample,
        source: input.source,
        rightsNote: input.rightsNote,
        createdById: actor.id,
      },
    });
  }

  async update(actor: AuthUser, id: string, input: z.infer<typeof updateItemSchema>) {
    const item = await this.get(id);
    if (item.status !== 'DRAFT') throw new BadRequestException('Only drafts can be edited. Duplicate a published item to change it.');
    const merged = { ...item, ...input, examCode: undefined } as unknown as CreateItem;
    this.checkRights(merged);
    const payload = input.payload ? this.validatePayload(item.kind, input.payload) : undefined;
    return this.prisma.contentItem.update({
      where: { id },
      data: { ...input, payload: payload as Prisma.InputJsonValue | undefined },
    });
  }

  async duplicate(actor: AuthUser, id: string) {
    const item = await this.get(id);
    return this.prisma.contentItem.create({
      data: {
        kind: item.kind,
        examCategoryId: item.examCategoryId,
        subjectId: item.subjectId,
        topicId: item.topicId,
        title: item.title,
        payload: item.payload as Prisma.InputJsonValue,
        year: item.year,
        isSample: item.isSample,
        source: item.source,
        rightsNote: item.rightsNote,
        createdById: actor.id,
      },
    });
  }

  async submit(actor: AuthUser, id: string) {
    return this.transition(id, ['DRAFT'], 'IN_REVIEW', actor);
  }

  private async transition(id: string, from: ContentStatus[], to: ContentStatus, actor: AuthUser) {
    const res = await this.prisma.contentItem.updateMany({ where: { id, status: { in: from } }, data: { status: to } });
    if (res.count !== 1) throw new BadRequestException(`Only ${from.join(' or ').toLowerCase()} items can move to ${to.toLowerCase().replace('_', ' ')}`);
    await this.audit.log({ actorId: actor.id, action: `content.${to.toLowerCase()}`, targetType: 'ContentItem', targetId: id });
    return this.get(id);
  }

  async review(actor: AuthUser, id: string, approved: boolean, comment?: string) {
    if (!REVIEWER_ROLES.includes(actor.role)) throw new ForbiddenException('Only subject experts can review');
    const item = await this.get(id);
    if (item.status !== 'IN_REVIEW') throw new BadRequestException('Item is not waiting for review');
    if (item.createdById === actor.id) throw new ForbiddenException('A second person must review this item');
    await this.prisma.contentReview.create({ data: { itemId: id, reviewerId: actor.id, approved, comment } });
    return this.prisma.contentItem.update({
      where: { id },
      data: approved ? { status: 'APPROVED', reviewedById: actor.id, approvedById: actor.id } : { status: 'DRAFT', reviewedById: actor.id },
    });
  }

  async schedule(actor: AuthUser, id: string, publishAt: Date) {
    const item = await this.get(id);
    if (item.status !== 'APPROVED' && item.status !== 'SCHEDULED') throw new BadRequestException('Only approved items can be scheduled');
    return this.prisma.contentItem.update({ where: { id }, data: { status: 'SCHEDULED', scheduledFor: publishAt } });
  }

  async archive(actor: AuthUser, id: string) {
    await this.get(id);
    return this.prisma.contentItem.update({ where: { id }, data: { status: 'ARCHIVED' } });
  }

  // ---------- Packs ----------

  /**
   * Builds and publishes the next pack version for an exam: every item already published,
   * plus approved items and scheduled items that are due. Builds a full pack (paid) and a
   * sample pack (free level) with the same version number.
   */
  async publishPack(examCode: ExamCode, whatsNew: string, actorId: string, now = new Date()) {
    const cat = await this.prisma.examCategory.findUniqueOrThrow({ where: { code: examCode } });
    const last = await this.prisma.contentPack.aggregate({ where: { examCategoryId: cat.id }, _max: { version: true } });
    const version = (last._max.version ?? 0) + 1;

    const newlyReady = await this.prisma.contentItem.findMany({
      where: { examCategoryId: cat.id, OR: [{ status: 'APPROVED' }, { status: 'SCHEDULED', scheduledFor: { lte: now } }] },
      select: { id: true },
    });
    if (newlyReady.length) {
      await this.prisma.contentItem.updateMany({ where: { id: { in: newlyReady.map((i) => i.id) } }, data: { status: 'PUBLISHED', publishedInPack: version } });
    }
    const items = await this.prisma.contentItem.findMany({
      where: { examCategoryId: cat.id, status: 'PUBLISHED' },
      include: { topic: { select: { name: true } }, subject: { select: { name: true } } },
      orderBy: [{ subjectId: 'asc' }, { topicId: 'asc' }, { createdAt: 'asc' }],
    });
    if (!items.length) throw new BadRequestException('Nothing is approved for this exam yet');

    const packs = [];
    for (const isSampleOnly of [false, true]) {
      const selected = isSampleOnly ? items.filter((i) => i.isSample) : items;
      const doc = {
        examCode,
        version,
        isSampleOnly,
        generatedAt: now.toISOString(),
        items: selected.map((i) => ({
          id: i.id,
          kind: i.kind,
          subjectId: i.subjectId,
          subjectName: i.subject.name,
          topicId: i.topicId,
          topicName: i.topic?.name ?? null,
          title: i.title,
          year: i.year,
          isSample: i.isSample,
          payload: i.payload,
        })),
      };
      const body = gzipSync(Buffer.from(JSON.stringify(doc)));
      const key = `packs/${examCode}/${isSampleOnly ? 'sample' : 'full'}-v${version}.json.gz`;
      await this.storage.put(key, body, 'application/gzip');
      packs.push(
        await this.prisma.contentPack.create({
          data: {
            examCategoryId: cat.id,
            version,
            isSampleOnly,
            whatsNew,
            storageKey: key,
            sha256: createHash('sha256').update(body).digest('hex'),
            sizeBytes: body.length,
            itemCount: selected.length,
            publishedById: actorId,
          },
        }),
      );
    }
    await this.audit.log({ actorId, action: 'content.pack_published', targetType: 'ContentPack', targetId: `${examCode}:v${version}`, metadata: { items: items.length, newItems: newlyReady.length } });
    return { version, items: items.length, newItems: newlyReady.length, packs: packs.map((p) => ({ id: p.id, isSampleOnly: p.isSampleOnly, sizeBytes: p.sizeBytes })) };
  }

  /** Rolls back the latest pack. Items first published in it go back to APPROVED; devices fall back to the previous version. */
  async rollbackPack(examCode: ExamCode, actorId: string) {
    const cat = await this.prisma.examCategory.findUniqueOrThrow({ where: { code: examCode } });
    const latest = await this.prisma.contentPack.findFirst({ where: { examCategoryId: cat.id, status: 'PUBLISHED' }, orderBy: { version: 'desc' } });
    if (!latest) throw new BadRequestException('No published pack to roll back');
    const previous = await this.prisma.contentPack.findFirst({ where: { examCategoryId: cat.id, status: 'PUBLISHED', version: { lt: latest.version } } });
    if (!previous) throw new BadRequestException('There is no earlier pack to go back to');
    await this.prisma.$transaction([
      this.prisma.contentPack.updateMany({ where: { examCategoryId: cat.id, version: latest.version }, data: { status: 'ROLLED_BACK', rolledBackAt: new Date() } }),
      this.prisma.contentItem.updateMany({ where: { examCategoryId: cat.id, publishedInPack: latest.version }, data: { status: 'APPROVED', publishedInPack: null } }),
    ]);
    await this.audit.log({ actorId, action: 'content.pack_rolled_back', targetType: 'ContentPack', targetId: `${examCode}:v${latest.version}`, metadata: { nowServing: previous.version } });
    return { rolledBack: latest.version, nowServing: previous.version };
  }

  async currentPack(examCode: ExamCode, sampleOnly: boolean) {
    return this.prisma.contentPack.findFirst({
      where: { examCategory: { code: examCode }, isSampleOnly: sampleOnly, status: 'PUBLISHED' },
      orderBy: { version: 'desc' },
    });
  }

  listPacks(examCode: ExamCode) {
    return this.prisma.contentPack.findMany({ where: { examCategory: { code: examCode } }, orderBy: [{ version: 'desc' }, { isSampleOnly: 'asc' }], take: 50 });
  }

  /** Answers to the questions in an attempt, read on the server so scores cannot be faked. */
  questionsForScoring(ids: string[]) {
    return this.prisma.contentItem.findMany({ where: { id: { in: ids }, kind: 'QUESTION' }, include: { topic: { select: { name: true } }, examCategory: { select: { code: true } } } });
  }

  private validatePayload(kind: ContentItem['kind'], payload: unknown) {
    const parsed = payloadByKind[kind].safeParse(payload);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `payload.${i.path.join('.')}: ${i.message}`));
    return parsed.data;
  }

  /** Past exam papers need written permission. Original practice material needs none. */
  private checkRights(input: Pick<CreateItem, 'year' | 'source' | 'rightsNote'>) {
    if (input.year != null && input.source !== 'LICENSED') throw new BadRequestException('Past exam questions (with a year) must be marked LICENSED with a rights note');
    if (input.source === 'LICENSED' && !input.rightsNote?.trim()) throw new BadRequestException('Licensed content needs a rights note (licence or permission reference)');
  }
}
