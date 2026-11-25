import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
const url = z.url().max(1000);

export const questionPayload = z
  .object({
    type: z.enum(['MULTIPLE_CHOICE', 'SHORT_ANSWER', 'ESSAY']),
    body: text(5000),
    imageUrl: url.optional(),
    options: z.array(z.object({ key: z.string().regex(/^[A-H]$/), text: text(1000), imageUrl: url.optional() })).min(2).max(8).optional(),
    /** Option key, or accepted short answers separated by "|". Leave out for essays. */
    answer: z.string().trim().max(500).optional(),
    /** Every question carries a worked explanation of the correct answer. */
    explanation: text(10_000),
    /** For essays: a marking guide shown after the student submits. */
    markingGuide: z.string().max(10_000).optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type === 'MULTIPLE_CHOICE') {
      if (!q.options?.length) ctx.addIssue({ code: 'custom', message: 'Multiple choice needs options', path: ['options'] });
      if (!q.answer || !q.options?.some((o) => o.key === q.answer)) ctx.addIssue({ code: 'custom', message: 'Answer must be one of the option keys', path: ['answer'] });
    }
    if (q.type === 'SHORT_ANSWER' && !q.answer) ctx.addIssue({ code: 'custom', message: 'Short answer needs accepted answers', path: ['answer'] });
  });

export const notePayload = z.object({
  markdown: text(100_000),
  keyPoints: z.array(text(500)).max(30).default([]),
  workedExamples: z.array(z.object({ problem: text(5000), solution: text(10_000) })).max(30).default([]),
  diagrams: z.array(z.object({ url, caption: z.string().max(300).default('') })).max(20).default([]),
});

export const flashcardDeckPayload = z.object({
  cards: z.array(z.object({ front: text(500), back: text(2000) })).min(1).max(500),
});

export const videoPayload = z.object({
  durationSeconds: z.number().int().positive().max(4 * 3600),
  /** S3 folder holding the HLS output, for example "videos/<id>/". */
  hlsPrefix: z.string().regex(/^videos\/[A-Za-z0-9_-]+\/$/),
  /** Lower bitrate MP4 used for offline downloads. */
  downloadKey: z.string().regex(/^videos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+\.mp4$/).optional(),
  thumbnailUrl: url.optional(),
  transcript: z.string().max(100_000).optional(),
  producedBy: z.enum(['UGO', 'LICENSED']),
});

export const payloadByKind = {
  QUESTION: questionPayload,
  NOTE: notePayload,
  FLASHCARD_DECK: flashcardDeckPayload,
  VIDEO: videoPayload,
} as const;

export const createItemSchema = z
  .object({
    kind: z.enum(['QUESTION', 'NOTE', 'FLASHCARD_DECK', 'VIDEO']),
    examCode: z.enum(['FSLC', 'COMMON_ENTRANCE', 'BECE', 'WAEC', 'NECO', 'JAMB', 'SAT', 'IELTS']),
    subjectId: z.uuid(),
    topicId: z.uuid().optional(),
    title: text(200),
    payload: z.record(z.string(), z.unknown()),
    /** Set only for real past exam questions. Requires a licence (source LICENSED and a rights note). */
    year: z.number().int().min(1980).max(2100).optional(),
    isSample: z.boolean().default(false),
    source: z.enum(['ORIGINAL', 'LICENSED']).default('ORIGINAL'),
    rightsNote: z.string().max(2000).optional(),
  })
  .strict();
export type CreateItem = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.omit({ kind: true, examCode: true }).partial().strict();
export const reviewSchema = z.object({ approved: z.boolean(), comment: z.string().max(2000).optional() }).strict();
export const scheduleSchema = z.object({ publishAt: z.iso.datetime() }).strict();
export const publishSchema = z.object({ whatsNew: text(500) }).strict();
