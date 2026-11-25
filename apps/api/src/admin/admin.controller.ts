import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { Prisma, type ExamCode } from '@prisma/client';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { password } from '../auth/auth.schemas.js';
import { TokensService } from '../auth/tokens.service.js';
import { SettingsService, SETTING_DEFAULTS, type SettingKey } from '../catalog/settings.service.js';
import { AdminIpGuard } from '../common/admin-ip.guard.js';
import { AdminAuditInterceptor } from '../common/audit.interceptor.js';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const examCode = z.enum(['FSLC', 'COMMON_ENTRANCE', 'BECE', 'WAEC', 'NECO', 'JAMB', 'SAT', 'IELTS']);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const categoryUpdate = z
  .object({
    name: z.string().min(2).max(100),
    description: z.string().max(1000),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    disclaimer: z.string().max(1000).nullable(),
    mockMinutes: z.number().int().min(1).max(600),
    mockSections: z.array(z.object({ name: z.string().min(1).max(100), durationMinutes: z.number().int().min(0).max(600), questionCount: z.number().int().min(1).max(500) })).min(1).max(20),
    tutorDailyLimit: z.number().int().min(0).max(1000),
    appleProductId: z.string().max(200).nullable(),
    googleProductId: z.string().max(200).nullable(),
    paystackPlanCode: z.string().max(200).nullable(),
    flutterwavePlanId: z.string().max(200).nullable(),
  })
  .partial()
  .strict();
const priceChange = z.object({ priceKobo: z.number().int().min(10_000).max(100_000_000) }).strict();
const subjectCreate = z.object({ name: z.string().trim().min(2).max(100), sortOrder: z.number().int().default(0) }).strict();
const subjectUpdate = z.object({ name: z.string().trim().min(2).max(100), isActive: z.boolean(), sortOrder: z.number().int() }).partial().strict();
const topicCreate = z.object({ name: z.string().trim().min(2).max(150), sortOrder: z.number().int().default(0) }).strict();
const promoCreate = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{4,40}$/),
    examCode: examCode.optional(),
    percentOff: z.number().int().min(0).max(100).default(0),
    grantsPlan: z.boolean().default(false),
    maxRedemptions: z.number().int().min(1).max(1_000_000),
    expiresAt: z.iso.datetime(),
  })
  .strict()
  .refine((p) => p.grantsPlan || p.percentOff > 0, 'A code must give a discount or grant a plan');
const staffCreate = z.object({ email: z.email().transform((v) => v.toLowerCase()), fullName: z.string().min(2).max(80), role: z.enum(['CONTENT_STAFF', 'SUPPORT', 'TUTOR', 'ADMIN']), temporaryPassword: password }).strict();
const range = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });

/** Admin dashboard API. Requires an admin role, MFA at sign in, and an allowlisted network. Every change is audited. */
@Controller('admin')
@UseGuards(AdminIpGuard)
@UseInterceptors(AdminAuditInterceptor)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
  ) {}

  // ---------- Exam categories, subjects and topics (data, not code) ----------

  @Roles('ADMIN', 'CONTENT_STAFF', 'SUPPORT')
  @Get('categories')
  categories() {
    return this.prisma.examCategory.findMany({ orderBy: { sortOrder: 'asc' }, include: { subjects: { orderBy: { sortOrder: 'asc' }, include: { _count: { select: { topics: true, content: true } } } } } });
  }

  @Roles('ADMIN')
  @Patch('categories/:code')
  updateCategory(@Param('code', { schema: examCode }) code: ExamCode, @Body({ schema: categoryUpdate }) body: z.infer<typeof categoryUpdate>) {
    return this.prisma.examCategory.update({ where: { code }, data: { ...body, mockSections: body.mockSections as Prisma.InputJsonValue | undefined } });
  }

  /**
   * Price changes apply to new web purchases and renewals only after the notice period.
   * Store prices are changed in App Store Connect and Play Console; this records the plan and the web price.
   */
  @Roles('ADMIN')
  @Post('categories/:code/price')
  async changePrice(@Param('code', { schema: examCode }) code: ExamCode, @Body({ schema: priceChange }) body: z.infer<typeof priceChange>) {
    const days = await this.settings.get('priceChangeNoticeDays');
    const from = new Date(Date.now() + days * 86_400_000);
    return this.prisma.examCategory.update({ where: { code }, data: { pendingPriceKobo: body.priceKobo, pendingPriceFrom: from } });
  }

  @Roles('ADMIN', 'CONTENT_STAFF')
  @Post('categories/:code/subjects')
  async addSubject(@Param('code', { schema: examCode }) code: ExamCode, @Body({ schema: subjectCreate }) body: z.infer<typeof subjectCreate>) {
    const cat = await this.prisma.examCategory.findUniqueOrThrow({ where: { code } });
    return this.prisma.subject.create({ data: { examCategoryId: cat.id, name: body.name, slug: slugify(body.name), sortOrder: body.sortOrder } }).catch(conflict('That subject already exists'));
  }

  /** Subjects are hidden rather than deleted, so past results keep their names. */
  @Roles('ADMIN', 'CONTENT_STAFF')
  @Patch('subjects/:id')
  updateSubject(@Param('id', ParseUUIDPipe) id: string, @Body({ schema: subjectUpdate }) body: z.infer<typeof subjectUpdate>) {
    return this.prisma.subject.update({ where: { id }, data: body });
  }

  @Roles('ADMIN', 'CONTENT_STAFF')
  @Post('subjects/:id/topics')
  addTopic(@Param('id', ParseUUIDPipe) id: string, @Body({ schema: topicCreate }) body: z.infer<typeof topicCreate>) {
    return this.prisma.topic.create({ data: { subjectId: id, name: body.name, sortOrder: body.sortOrder } }).catch(conflict('That topic already exists'));
  }

  // ---------- Promo codes ----------

  @Roles('ADMIN')
  @Get('promo-codes')
  promos() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Roles('ADMIN')
  @Post('promo-codes')
  createPromo(@Body({ schema: promoCreate }) body: z.infer<typeof promoCreate>) {
    return this.prisma.promoCode.create({ data: { ...body, expiresAt: new Date(body.expiresAt) } }).catch(conflict('That code already exists'));
  }

  @Roles('ADMIN')
  @Delete('promo-codes/:id')
  @HttpCode(204)
  async expirePromo(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.promoCode.update({ where: { id }, data: { expiresAt: new Date() } });
  }

  // ---------- User support ----------

  @Roles('ADMIN', 'SUPPORT')
  @Get('users')
  async findUsers(@Query('email') email?: string) {
    if (!email || email.length < 3) throw new BadRequestException('Search by at least 3 characters of an email address');
    const users = await this.prisma.user.findMany({
      where: { email: { contains: email.toLowerCase() } },
      take: 25,
      select: { id: true, email: true, role: true, status: true, displayName: true, createdAt: true, mfaMethod: true, emailVerifiedAt: true },
    });
    return users;
  }

  /** Plans and payment history for a user. There is no card data anywhere in Ugo to show. */
  @Roles('ADMIN', 'SUPPORT')
  @Get('users/:id')
  async user(@Param('id', ParseUUIDPipe) id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, role: true, status: true, displayName: true, fullName: true, createdAt: true, mfaMethod: true, emailVerifiedAt: true,
        entitlements: { orderBy: { expiresAt: 'desc' } },
        childLinks: { select: { childId: true, status: true, consentGivenAt: true, consentMethod: true } },
        parentLinks: { select: { parentId: true, status: true, consentGivenAt: true, consentMethod: true } },
      },
    });
    if (!u) throw new NotFoundException();
    return u;
  }

  /** Resets MFA to email codes and signs the user out everywhere. */
  @Roles('ADMIN', 'SUPPORT')
  @Post('users/:id/reset-mfa')
  @HttpCode(204)
  async resetMfa(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.user.update({ where: { id }, data: { mfaMethod: 'EMAIL_OTP', mfaEnabled: true, totpSecretEnc: null } });
    await this.tokens.revokeAllForUser(id);
  }

  @Roles('ADMIN')
  @Post('users/:id/suspend')
  @HttpCode(204)
  async suspend(@CurrentUser() me: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    if (id === me.id) throw new BadRequestException('You cannot suspend yourself');
    await this.prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
    await this.tokens.revokeAllForUser(id);
  }

  @Roles('ADMIN')
  @Post('users/:id/unsuspend')
  @HttpCode(204)
  async unsuspend(@Param('id', ParseUUIDPipe) id: string) {
    await this.prisma.user.updateMany({ where: { id, status: 'SUSPENDED' }, data: { status: 'ACTIVE' } });
  }

  @Roles('ADMIN')
  @Post('staff')
  async createStaff(@Body({ schema: staffCreate }) body: z.infer<typeof staffCreate>) {
    const u = await this.prisma.user
      .create({
        data: { email: body.email, fullName: body.fullName, displayName: body.fullName.split(' ')[0], role: body.role, passwordHash: await this.auth.hashPassword(body.temporaryPassword), mfaEnabled: true, mfaMethod: 'EMAIL_OTP' },
      })
      .catch(conflict('An account with this email already exists'));
    return { id: u.id, email: u.email, role: u.role };
  }

  // ---------- Reports and analytics ----------

  /** Revenue and active plans per exam category and payment source. Store revenue is before store commission. */
  @Roles('ADMIN')
  @Get('reports/subscriptions')
  async subscriptions(@Query({ schema: range }) q: z.infer<typeof range>) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86_400_000);
    const to = q.to ? new Date(`${q.to}T23:59:59Z`) : new Date();
    const [active, started, byStatus] = await Promise.all([
      this.prisma.entitlement.groupBy({ by: ['examCode', 'source'], where: { status: { in: ['ACTIVE', 'CANCELLED', 'GRACE_PERIOD', 'BILLING_RETRY'] }, expiresAt: { gt: new Date() } }, _count: { _all: true } }),
      this.prisma.entitlement.groupBy({ by: ['examCode', 'source'], where: { createdAt: { gte: from, lte: to } }, _count: { _all: true }, _sum: { pricePaidKobo: true } }),
      this.prisma.entitlement.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      active: active.map((r) => ({ examCode: r.examCode, source: r.source, count: r._count._all })),
      newPlans: started.map((r) => ({ examCode: r.examCode, source: r.source, count: r._count._all, webRevenueKobo: r._sum.pricePaidKobo ?? 0 })),
      byStatus: byStatus.map((r) => ({ status: r.status, count: r._count._all })),
      note: 'Web revenue is recorded per payment. App Store and Google Play revenue comes from the store reports; see docs/PAYMENTS_RUNBOOK.md for reconciliation.',
    };
  }

  @Roles('ADMIN', 'CONTENT_STAFF')
  @Get('reports/usage')
  async usage(@Query({ schema: range }) q: z.infer<typeof range>) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86_400_000);
    const to = q.to ? new Date(`${q.to}T23:59:59Z`) : new Date();
    const [byExam, learners, daily] = await Promise.all([
      this.prisma.attempt.groupBy({ by: ['examCode', 'mode'], where: { finishedAt: { gte: from, lte: to } }, _count: { _all: true }, _avg: { percentage: true } }),
      this.prisma.attempt.findMany({ where: { finishedAt: { gte: from, lte: to } }, distinct: ['userId'], select: { userId: true } }),
      this.prisma.$queryRaw<{ day: Date; learners: bigint; attempts: bigint }[]>`
        SELECT date_trunc('day', "finishedAt" + interval '1 hour') AS day, COUNT(DISTINCT "userId") AS learners, COUNT(*) AS attempts
        FROM "Attempt" WHERE "finishedAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 1`,
    ]);
    return {
      activeLearners: learners.length,
      byExam: byExam.map((r) => ({ examCode: r.examCode, mode: r.mode, attempts: r._count._all, averagePercentage: Math.round((r._avg.percentage ?? 0) * 10) / 10 })),
      daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), learners: Number(d.learners), attempts: Number(d.attempts) })),
    };
  }

  @Roles('ADMIN')
  @Get('audit-log')
  auditLog(@Query('before') before?: string) {
    return this.prisma.auditLog.findMany({ where: before ? { createdAt: { lt: new Date(before) } } : {}, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  @Roles('ADMIN')
  @Get('payment-events')
  paymentEvents(@Query('failed') failed?: string) {
    return this.prisma.paymentEvent.findMany({ where: failed === 'true' ? { OR: [{ processedAt: null }, { error: { not: null } }] } : {}, orderBy: { receivedAt: 'desc' }, take: 100 });
  }

  // ---------- Settings ----------

  @Roles('ADMIN')
  @Get('settings')
  allSettings() {
    return this.settings.all();
  }

  @Roles('ADMIN')
  @Put('settings/:key')
  async setSetting(@Param('key') key: string, @Body() body: { value: unknown }) {
    if (!(key in SETTING_DEFAULTS)) throw new BadRequestException('Unknown setting');
    const expected = typeof SETTING_DEFAULTS[key as SettingKey];
    const v = body?.value;
    if (!(v === null && key === 'maintenanceMessage') && typeof v !== expected) throw new BadRequestException(`Setting ${key} must be a ${expected}`);
    if ((key === 'minSupportedVersion' || key === 'latestVersion') && !/^\d+\.\d+\.\d+$/.test(String(v))) throw new BadRequestException('Use a version like 1.4.0');
    await this.settings.set(key as SettingKey, v);
    return this.settings.all();
  }
}

function conflict(message: string) {
  return (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new BadRequestException(message);
    throw e;
  };
}
