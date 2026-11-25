import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHmac, createPublicKey, verify } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { EmailService } from '../src/notifications/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

let app: INestApplication;
let http: ReturnType<typeof request>;
let prisma: PrismaService;
let email: EmailService;

const lastCode = (to: string) => {
  const msg = [...email.outbox].reverse().find((m) => m.to === to);
  const m = msg?.text.match(/\b(\d{6,8})\b/);
  if (!m) throw new Error(`No code emailed to ${to}`);
  return m[1];
};

async function signIn(addr: string, pw: string) {
  const res = await http.post('/api/v1/auth/login').send({ email: addr, password: pw }).expect(200);
  if (!res.body.mfaRequired) return res.body;
  const done = await http.post('/api/v1/auth/mfa/verify').send({ challengeId: res.body.challengeId, code: lastCode(addr) }).expect(200);
  return done.body;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerGuard)
    .useValue({ canActivate: () => true })
    .compile();
  app = moduleRef.createNestApplication({ rawBody: true });
  configureApp(app, '');
  await app.init();
  http = request(app.getHttpServer());
  prisma = app.get(PrismaService);
  email = app.get(EmailService);

  // Minimal catalogue: one exam with one subject and topic.
  const cat = await prisma.examCategory.create({
    data: { code: 'WAEC', name: 'WAEC', level: 'SENIOR_SECONDARY', description: 'x', minAge: 14, priceKobo: 700_000, mockMinutes: 60, mockSections: [], paystackPlanCode: 'PLN_waec', googleProductId: 'plan_waec' },
  });
  const subject = await prisma.subject.create({ data: { examCategoryId: cat.id, name: 'Mathematics', slug: 'mathematics' } });
  await prisma.topic.create({ data: { subjectId: subject.id, name: 'Algebra' } });
});

afterAll(async () => {
  await app.close();
});

describe('Ugo API', () => {
  const parentEmail = 'parent@example.com';
  const pw = 'Str0ng-passphrase';
  let parentToken = '';
  let childId = '';
  let childToken = '';
  let questionId = '';

  it('health and public catalogue', async () => {
    await http.get('/health').expect(200, { status: 'ok' });
    const cat = await http.get('/api/v1/catalog').expect(200);
    expect(cat.body[0]).toMatchObject({ code: 'WAEC', webPriceKobo: 700_000 });
    await http.get('/api/v1/me').expect(401);
  });

  it('rejects a weak password and unknown fields', async () => {
    const res = await http.post('/api/v1/auth/register').send({ role: 'PARENT', email: 'x@example.com', password: 'short', fullName: 'X', displayName: 'X1', dateOfBirth: '1985-01-01', acceptedTermsVersion: '1' }).expect(400);
    expect(JSON.stringify(res.body.message)).toMatch(/10 characters/);
    await http.post('/api/v1/auth/register').send({ role: 'ADMIN', email: 'y@example.com', password: pw, fullName: 'Y', displayName: 'Y1', dateOfBirth: '1985-01-01', acceptedTermsVersion: '1' }).expect(400);
  });

  it('parent signs up, verifies email and signs in with an email code (MFA on by default)', async () => {
    const reg = await http.post('/api/v1/auth/register').send({ role: 'PARENT', email: parentEmail, password: pw, fullName: 'Ngozi Okafor', displayName: 'Ngozi', dateOfBirth: '1984-03-02', acceptedTermsVersion: '2026-11' }).expect(201);
    await http.post('/api/v1/auth/verify-email').set('Authorization', `Bearer ${reg.body.accessToken}`).send({ code: lastCode(parentEmail) }).expect(204);
    const login = await http.post('/api/v1/auth/login').send({ email: parentEmail, password: pw }).expect(200);
    expect(login.body.mfaRequired).toBe(true);
    await http.post('/api/v1/auth/mfa/verify').send({ challengeId: login.body.challengeId, code: '000000' }).expect(400);
    const done = await http.post('/api/v1/auth/mfa/verify').send({ challengeId: login.body.challengeId, code: lastCode(parentEmail) }).expect(200);
    parentToken = done.body.accessToken;
    const me = await http.get('/api/v1/me').set('Authorization', `Bearer ${parentToken}`).expect(200);
    expect(me.body).toMatchObject({ role: 'PARENT', emailVerified: true, mfaMethod: 'EMAIL_OTP' });
    expect(me.body.passwordHash).toBeUndefined();
  });

  it('wrong passwords are rejected the same way as unknown emails', async () => {
    const a = await http.post('/api/v1/auth/login').send({ email: parentEmail, password: 'Wrong-password-1' }).expect(401);
    const b = await http.post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'Wrong-password-1' }).expect(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('refresh tokens rotate, and a reused token ends the session', async () => {
    const pair = await signIn(parentEmail, pw);
    const rotated = await http.post('/api/v1/auth/refresh').send({ refreshToken: pair.refreshToken }).expect(200);
    await http.post('/api/v1/auth/refresh').send({ refreshToken: pair.refreshToken }).expect(401); // reuse
    await http.post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401); // family revoked
  });

  it('parent creates a child profile and hands over a child session', async () => {
    const res = await http.post('/api/v1/parents/children').set('Authorization', `Bearer ${parentToken}`).send({ fullName: 'Chidi Okafor', displayName: 'Chidi', dateOfBirth: '2009-05-01' }).expect(201);
    childId = res.body.id;
    const s = await http.post(`/api/v1/parents/children/${childId}/session`).set('Authorization', `Bearer ${parentToken}`).expect(200);
    childToken = s.body.accessToken;
    const me = await http.get('/api/v1/me').set('Authorization', `Bearer ${childToken}`).expect(200);
    expect(me.body).toMatchObject({ role: 'LEARNER', status: 'ACTIVE', hasParent: true });
    // A learner cannot use parent routes.
    await http.get('/api/v1/parents/children').set('Authorization', `Bearer ${childToken}`).expect(403);
  });

  it('a learner under 18 who signs up alone waits for a parent to consent', async () => {
    const teen = 'teen@example.com';
    const reg = await http.post('/api/v1/auth/register').send({ role: 'LEARNER', email: teen, password: pw, fullName: 'Amina Bello', displayName: 'Amina', dateOfBirth: '2011-02-02', acceptedTermsVersion: '2026-11', parentEmail }).expect(201);
    expect(reg.body.status).toBe('PENDING_CONSENT');
    const blocked = await http.get('/api/v1/progress/summary').set('Authorization', `Bearer ${reg.body.accessToken}`).expect(403);
    expect(blocked.body.code).toBe('CONSENT_REQUIRED');
    const consentCode = [...email.outbox].reverse().find((m) => m.to === parentEmail && /wants to use Ugo/.test(m.subject))!.text.match(/\b(\d{8})\b/)![1];
    await http.post('/api/v1/parents/consent').set('Authorization', `Bearer ${parentToken}`).send({ code: '00000000' }).expect(400);
    await http.post('/api/v1/parents/consent').set('Authorization', `Bearer ${parentToken}`).send({ code: consentCode }).expect(200);
    await http.get('/api/v1/progress/summary').set('Authorization', `Bearer ${reg.body.accessToken}`).expect(200);
    // Under 18 without a parent email is refused.
    await http.post('/api/v1/auth/register').send({ role: 'LEARNER', email: 'kid2@example.com', password: pw, fullName: 'K', displayName: 'Kid', dateOfBirth: '2012-02-02', acceptedTermsVersion: '1' }).expect(400);
  });

  it('content goes through review by a second person, then publishes as a versioned pack, and can roll back', async () => {
    const staffPw = 'Staff-pass-1234';
    const authSvc = await import('../src/auth/auth.service.js');
    const hasher = app.get(authSvc.AuthService);
    for (const e of ['writer@ugo.ng', 'reviewer@ugo.ng']) {
      await prisma.user.create({ data: { email: e, passwordHash: await hasher.hashPassword(staffPw), role: 'CONTENT_STAFF', fullName: e, displayName: 'Staff', emailVerifiedAt: new Date() } });
    }
    const writer = (await signIn('writer@ugo.ng', staffPw)).accessToken;
    const reviewer = (await signIn('reviewer@ugo.ng', staffPw)).accessToken;
    const subject = await prisma.subject.findFirstOrThrow();
    const topic = await prisma.topic.findFirstOrThrow();

    // Past exam questions need a licence.
    await http.post('/api/v1/admin/content/items').set('Authorization', `Bearer ${writer}`).send({ kind: 'QUESTION', examCode: 'WAEC', subjectId: subject.id, topicId: topic.id, title: 'Q', year: 2019, payload: { type: 'MULTIPLE_CHOICE', body: 'x', options: [{ key: 'A', text: '1' }, { key: 'B', text: '2' }], answer: 'A', explanation: 'e' } }).expect(400);

    const item = await http
      .post('/api/v1/admin/content/items')
      .set('Authorization', `Bearer ${writer}`)
      .send({ kind: 'QUESTION', examCode: 'WAEC', subjectId: subject.id, topicId: topic.id, title: 'Solve 2x = 8', isSample: true, payload: { type: 'MULTIPLE_CHOICE', body: 'Solve 2x = 8', options: [{ key: 'A', text: '2' }, { key: 'B', text: '4' }], answer: 'B', explanation: 'Divide both sides by 2: x = 4.' } })
      .expect(201);
    questionId = item.body.id;
    await http.post(`/api/v1/admin/content/items/${questionId}/submit`).set('Authorization', `Bearer ${writer}`).expect(200);
    await http.post(`/api/v1/admin/content/items/${questionId}/review`).set('Authorization', `Bearer ${writer}`).send({ approved: true }).expect(403);
    await http.post(`/api/v1/admin/content/items/${questionId}/review`).set('Authorization', `Bearer ${reviewer}`).send({ approved: true, comment: 'Correct' }).expect(200);
    const v1 = await http.post('/api/v1/admin/content/packs/WAEC/publish').set('Authorization', `Bearer ${reviewer}`).send({ whatsNew: 'First questions' }).expect(201);
    expect(v1.body).toMatchObject({ version: 1, items: 1, newItems: 1 });

    // Learners cannot reach the admin API.
    await http.get('/api/v1/admin/content/items').set('Authorization', `Bearer ${childToken}`).expect(403);

    // A second item, a second pack, then a rollback back to version 1.
    const second = await http.post(`/api/v1/admin/content/items/${questionId}/duplicate`).set('Authorization', `Bearer ${writer}`).expect(201);
    await http.post(`/api/v1/admin/content/items/${second.body.id}/submit`).set('Authorization', `Bearer ${writer}`).expect(200);
    await http.post(`/api/v1/admin/content/items/${second.body.id}/review`).set('Authorization', `Bearer ${reviewer}`).send({ approved: true }).expect(200);
    await http.post('/api/v1/admin/content/packs/WAEC/publish').set('Authorization', `Bearer ${reviewer}`).send({ whatsNew: 'More' }).expect(201);
    const admin = await prisma.user.create({ data: { email: 'admin@ugo.ng', passwordHash: await hasher.hashPassword(staffPw), role: 'ADMIN', fullName: 'Admin', displayName: 'Admin', emailVerifiedAt: new Date() } });
    const adminToken = (await signIn(admin.email, staffPw)).accessToken;
    const rb = await http.post('/api/v1/admin/content/packs/WAEC/rollback').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(rb.body).toEqual({ rolledBack: 2, nowServing: 1 });
    const audit = await http.get('/api/v1/admin/audit-log').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(audit.body.some((a: { action: string }) => a.action.includes('rollback'))).toBe(true);
  });

  it('a free learner gets the sample pack', async () => {
    const m = await http.get('/api/v1/content/packs/WAEC').set('Authorization', `Bearer ${childToken}`).expect(200);
    expect(m.body).toMatchObject({ version: 1, isSampleOnly: true });
    const file = await http.get(new URL(m.body.url).pathname + new URL(m.body.url).search).expect(200);
    expect(file.headers['content-type']).toMatch(/gzip/);
    await http.get('/api/v1/content/files?key=packs/WAEC/full-v1.json.gz&expires=9999999999&sig=bad').expect(403);
  });

  it('offline sync is idempotent and scores are worked out on the server', async () => {
    const attempt = { clientId: 'attempt-0001', examCode: 'WAEC', subjectId: (await prisma.subject.findFirstOrThrow()).id, mode: 'PRACTICE', startedAt: new Date(Date.now() - 600_000).toISOString(), finishedAt: new Date(Date.now() - 300_000).toISOString(), answers: [{ questionId, chosen: 'B', timeSpentMs: 20_000 }] };
    await http.post('/api/v1/sync').set('Authorization', `Bearer ${childToken}`).send({ attempts: [attempt] }).expect(200);
    await http.post('/api/v1/sync').set('Authorization', `Bearer ${childToken}`).send({ attempts: [attempt] }).expect(200);
    const rows = await prisma.attempt.findMany({ where: { userId: childId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ score: 1, markable: 1, percentage: 100 });
    // The parent sees the child's progress.
    const p = await http.get(`/api/v1/parents/children/${childId}/progress`).set('Authorization', `Bearer ${parentToken}`).expect(200);
    expect(p.body.summary.totalAttempts).toBe(1);
  });

  it('a Paystack payment (signature checked, then verified with Paystack) unlocks the plan, offline proof included', async () => {
    const reference = 'ref_test_1';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      if (String(url).includes(`/transaction/verify/${reference}`)) {
        return new Response(JSON.stringify({ status: true, data: { id: 1, status: 'success', reference, amount: 700_000, currency: 'NGN', customer: { customer_code: 'CUS_1' }, plan: { plan_code: 'PLN_waec' }, metadata: { userId: childId, examCode: 'WAEC' } } }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    try {
      const body = JSON.stringify({ event: 'charge.success', data: { reference, amount: 700_000, authorization: { last4: '4081', bin: '408408' } } });
      await http.post('/api/v1/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', 'bad').send(body).expect(401);
      const sig = createHmac('sha512', 'sk_test_paystack').update(body).digest('hex');
      await http.post('/api/v1/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(body).expect(200);
      await http.post('/api/v1/webhooks/paystack').set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(body).expect(200); // retried webhook
    } finally {
      globalThis.fetch = originalFetch;
    }
    const ents = await http.get('/api/v1/billing/entitlements').set('Authorization', `Bearer ${childToken}`).expect(200);
    expect(ents.body.entitlements).toHaveLength(1);
    expect(ents.body.entitlements[0]).toMatchObject({ examCode: 'WAEC', source: 'PAYSTACK', active: true, autoRenew: true });
    const expires = new Date(ents.body.entitlements[0].expiresAt).getTime();
    expect(expires - Date.now()).toBeGreaterThan(360 * 86_400_000);

    // The signed entitlement verifies with the public key the app receives.
    const cfg = await http.get('/api/v1/app-config').expect(200);
    const [payload, sig] = ents.body.signed.split('.');
    const pub = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(cfg.body.entitlementPublicKey, 'base64')]), format: 'der', type: 'spki' });
    expect(verify(null, Buffer.from(payload), pub, Buffer.from(sig, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString()).entitlements[0].examCode).toBe('WAEC');

    // No card data stored.
    const events = await prisma.paymentEvent.findMany();
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0].payload)).not.toMatch(/4081|408408|authorization/);

    // Now the full pack is served.
    const m = await http.get('/api/v1/content/packs/WAEC').set('Authorization', `Bearer ${childToken}`).expect(200);
    expect(m.body.isSampleOnly).toBe(false);
  });

  it('the tutor refuses free users and is unavailable without an API key', async () => {
    const free = await signIn('teen@example.com', pw);
    await http.post('/api/v1/tutor/messages').set('Authorization', `Bearer ${free.accessToken}`).send({ messages: [{ role: 'user', content: 'Help with algebra' }] }).expect(503);
    const usage = await http.get('/api/v1/tutor/usage').set('Authorization', `Bearer ${childToken}`).expect(200);
    expect(usage.body.limit).toBe(40);
  });

  it('withdrawing consent deletes the child profile and its data', async () => {
    await http.delete(`/api/v1/parents/children/${childId}`).set('Authorization', `Bearer ${parentToken}`).expect(204);
    expect(await prisma.user.findUnique({ where: { id: childId } })).toBeNull();
    expect(await prisma.attempt.count({ where: { userId: childId } })).toBe(0);
    await http.get('/api/v1/me').set('Authorization', `Bearer ${childToken}`).expect(401);
  });

  it('a user can delete their own account', async () => {
    await http.delete('/api/v1/me').set('Authorization', `Bearer ${parentToken}`).send({ password: 'wrong' }).expect(401);
    await http.delete('/api/v1/me').set('Authorization', `Bearer ${parentToken}`).send({ password: pw }).expect(204);
    await http.post('/api/v1/auth/login').send({ email: parentEmail, password: pw }).expect(401);
  });
});
