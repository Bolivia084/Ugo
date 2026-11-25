/**
 * Seeds exam categories, subjects, starter content and the first admin account.
 * Safe to run more than once. Usage: npm run db:seed
 * Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create the first admin (MFA is enforced at sign in).
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { EXAM_CATALOG, mockDurationMinutes } from '@ugo/shared';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { SEED_CONTENT } from './seed-content.js';

const prisma = new PrismaClient();
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function main() {
  for (const [i, e] of EXAM_CATALOG.entries()) {
    const cat = await prisma.examCategory.upsert({
      where: { code: e.code },
      create: {
        code: e.code,
        name: e.name,
        level: e.level,
        description: e.description,
        minAge: e.minAge,
        priceKobo: e.defaultPriceKobo,
        sortOrder: i,
        disclaimer: e.disclaimer,
        electiveCount: e.electiveCount,
        mockMinutes: mockDurationMinutes(e.code),
        mockSections: e.mockSections as unknown as Prisma.InputJsonValue,
        appleProductId: `ng.ugo.app.plan.${e.code.toLowerCase()}.annual`,
        googleProductId: `plan_${e.code.toLowerCase()}`,
      },
      update: {},
    });
    for (const [j, name] of e.subjects.entries()) {
      await prisma.subject.upsert({ where: { examCategoryId_slug: { examCategoryId: cat.id, slug: slugify(name) } }, create: { examCategoryId: cat.id, name, slug: slugify(name), sortOrder: j }, update: {} });
    }
  }
  console.log(`Seeded ${EXAM_CATALOG.length} exam categories`);

  let admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin && process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    admin = await prisma.user.create({
      data: {
        email: process.env.SEED_ADMIN_EMAIL.toLowerCase(),
        passwordHash: await argon2.hash(process.env.SEED_ADMIN_PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
        role: 'ADMIN',
        fullName: 'Ugo Admin',
        displayName: 'Admin',
        emailVerifiedAt: new Date(),
        mfaEnabled: true,
      },
    });
    console.log(`Created admin ${admin.email}`);
  }
  if (!admin) {
    console.log('No admin yet: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one. Skipping starter content.');
    return;
  }

  if (process.env.SEED_STARTER_CONTENT === 'false') return;
  const touched = new Set<string>();
  for (const s of SEED_CONTENT) {
    const cat = await prisma.examCategory.findUniqueOrThrow({ where: { code: s.examCode } });
    const subject = await prisma.subject.findUniqueOrThrow({ where: { examCategoryId_slug: { examCategoryId: cat.id, slug: slugify(s.subject) } } });
    if ((await prisma.contentItem.count({ where: { subjectId: subject.id } })) > 0) continue;
    const topics = new Map<string, string>();
    for (const [k, t] of s.topics.entries()) {
      const topic = await prisma.topic.upsert({ where: { subjectId_name: { subjectId: subject.id, name: t } }, create: { subjectId: subject.id, name: t, sortOrder: k }, update: {} });
      topics.set(t, topic.id);
    }
    const base = { examCategoryId: cat.id, subjectId: subject.id, status: 'PUBLISHED' as const, source: 'ORIGINAL' as const, createdById: admin.id, approvedById: admin.id, reviewedById: admin.id, publishedInPack: 1 };
    for (const [n, q] of s.questions.entries()) {
      await prisma.contentItem.create({
        data: {
          ...base,
          kind: 'QUESTION',
          topicId: topics.get(q.topic),
          title: q.body.slice(0, 80),
          isSample: n < 3,
          payload: { type: 'MULTIPLE_CHOICE', body: q.body, options: q.options.map((text, idx) => ({ key: 'ABCD'[idx], text })), answer: q.answer, explanation: q.explanation },
        },
      });
    }
    await prisma.contentItem.create({ data: { ...base, kind: 'NOTE', topicId: topics.get(s.note.topic), title: s.note.title, isSample: true, payload: { markdown: s.note.markdown, keyPoints: s.note.keyPoints, workedExamples: [], diagrams: [] } } });
    await prisma.contentItem.create({ data: { ...base, kind: 'FLASHCARD_DECK', title: `${s.subject}: key terms`, isSample: true, payload: { cards: s.cards } } });
    touched.add(s.examCode);
  }

  // Version 1 packs for development (staging and production publish through the admin dashboard).
  const dir = resolve(process.env.LOCAL_STORAGE_DIR ?? './storage');
  for (const code of touched) {
    const cat = await prisma.examCategory.findUniqueOrThrow({ where: { code: code as never } });
    const items = await prisma.contentItem.findMany({ where: { examCategoryId: cat.id, status: 'PUBLISHED' }, include: { topic: true, subject: true } });
    for (const isSampleOnly of [false, true]) {
      const selected = isSampleOnly ? items.filter((i) => i.isSample) : items;
      const doc = { examCode: code, version: 1, isSampleOnly, generatedAt: new Date().toISOString(), items: selected.map((i) => ({ id: i.id, kind: i.kind, subjectId: i.subjectId, subjectName: i.subject.name, topicId: i.topicId, topicName: i.topic?.name ?? null, title: i.title, year: i.year, isSample: i.isSample, payload: i.payload })) };
      const body = gzipSync(Buffer.from(JSON.stringify(doc)));
      const key = `packs/${code}/${isSampleOnly ? 'sample' : 'full'}-v1.json.gz`;
      if (process.env.STORAGE_DRIVER !== 's3') {
        await mkdir(dirname(join(dir, key)), { recursive: true });
        await writeFile(join(dir, key), body);
      }
      await prisma.contentPack.upsert({
        where: { examCategoryId_isSampleOnly_version: { examCategoryId: cat.id, isSampleOnly, version: 1 } },
        create: { examCategoryId: cat.id, version: 1, isSampleOnly, whatsNew: 'Starter questions, notes and flashcards', storageKey: key, sha256: createHash('sha256').update(body).digest('hex'), sizeBytes: body.length, itemCount: selected.length, publishedById: admin.id },
        update: {},
      });
    }
  }
  console.log(`Seeded starter content for ${touched.size} exams`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
