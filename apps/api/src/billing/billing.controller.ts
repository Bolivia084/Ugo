import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public, Roles } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from './billing.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { GoogleVerifier, } from './store-verifiers.js';
import { FlutterwaveClient, PaystackClient } from './web-payments.js';

const examCode = z.enum(['FSLC', 'COMMON_ENTRANCE', 'BECE', 'WAEC', 'NECO', 'JAMB', 'SAT', 'IELTS']);
const appleSchema = z.object({ signedTransaction: z.string().min(20).max(20_000) }).strict();
const googleSchema = z.object({ purchaseToken: z.string().min(10).max(2000), productId: z.string().min(1).max(200) }).strict();
const restoreSchema = z
  .object({
    apple: z.array(z.string().min(20).max(20_000)).max(50).default([]),
    google: z.array(googleSchema).max(50).default([]),
  })
  .strict();
const checkoutSchema = z.object({ examCode, provider: z.enum(['PAYSTACK', 'FLUTTERWAVE']).default('PAYSTACK'), promoCode: z.string().max(40).optional(), forUserId: z.uuid().optional() }).strict();
const promoSchema = z.object({ code: z.string().min(3).max(40), examCode, forUserId: z.uuid().optional() }).strict();

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly entitlements: EntitlementsService,
    private readonly prisma: PrismaService,
  ) {}

  /** The user's plans and the signed copy for offline use. Parents can read a linked child's plans with ?childId. */
  @Get('entitlements')
  entitlementsFor(@CurrentUser() user: AuthUser) {
    return this.entitlements.snapshot(user.id);
  }

  @Post('apple/verify')
  @HttpCode(200)
  async apple(@CurrentUser() user: AuthUser, @Body({ schema: appleSchema }) body: z.infer<typeof appleSchema>) {
    await this.billing.verifyApple(user.id, body.signedTransaction);
    return this.entitlements.snapshot(user.id);
  }

  @Post('google/verify')
  @HttpCode(200)
  async google(@CurrentUser() user: AuthUser, @Body({ schema: googleSchema }) body: z.infer<typeof googleSchema>) {
    await this.billing.verifyGoogle(user.id, body.purchaseToken, body.productId);
    return this.entitlements.snapshot(user.id);
  }

  /** "Restore purchases": the app sends every purchase the store knows for this device's store account. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('restore')
  @HttpCode(200)
  async restore(@CurrentUser() user: AuthUser, @Body({ schema: restoreSchema }) body: z.infer<typeof restoreSchema>) {
    const errors: string[] = [];
    for (const jws of body.apple) await this.billing.verifyApple(user.id, jws).catch((e: Error) => errors.push(e.message));
    for (const g of body.google) await this.billing.verifyGoogle(user.id, g.purchaseToken, g.productId).catch((e: Error) => errors.push(e.message));
    return { ...(await this.entitlements.snapshot(user.id)), errors };
  }

  /** Web checkout (Paystack or Flutterwave). Used by the Ugo website. A parent may pay for a linked child. */
  @Roles('PARENT', 'LEARNER')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('web/checkout')
  async webCheckout(@CurrentUser() user: AuthUser, @Body({ schema: checkoutSchema }) body: z.infer<typeof checkoutSchema>) {
    const target = await this.targetUser(user, body.forUserId);
    return this.billing.startWebCheckout(target, body.examCode, body.provider, body.promoCode);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('promo/redeem')
  @HttpCode(200)
  async redeem(@CurrentUser() user: AuthUser, @Body({ schema: promoSchema }) body: z.infer<typeof promoSchema>) {
    const target = await this.targetUser(user, body.forUserId);
    await this.billing.redeemPromo(target, body.code, body.examCode);
    return this.entitlements.snapshot(target);
  }

  private async targetUser(user: AuthUser, forUserId?: string): Promise<string> {
    if (!forUserId || forUserId === user.id) return user.id;
    if (user.role !== 'PARENT') throw new ForbiddenException('Only a parent can buy for another account');
    const link = await this.prisma.parentLink.findUnique({ where: { parentId_childId: { parentId: user.id, childId: forUserId } } });
    if (link?.status !== 'ACTIVE') throw new ForbiddenException('Not your child');
    return forUserId;
  }
}

/** Store notifications and payment webhooks. Public, but every request is verified by signature. */
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly billing: BillingService,
    private readonly paystack: PaystackClient,
    private readonly flutterwave: FlutterwaveClient,
    private readonly google: GoogleVerifier,
  ) {}

  @Public()
  @Post('paystack')
  @HttpCode(200)
  async paystackHook(@Req() req: RawBodyRequest<Request>, @Headers('x-paystack-signature') sig?: string) {
    if (!this.paystack.verifySignature(req.rawBody, sig)) throw new UnauthorizedException('Bad signature');
    await this.billing.handlePaystackEvent(req.body);
    return { received: true };
  }

  @Public()
  @Post('flutterwave')
  @HttpCode(200)
  async flutterwaveHook(@Req() req: Request, @Headers('verif-hash') hash?: string) {
    if (!this.flutterwave.verifySignature(hash)) throw new UnauthorizedException('Bad signature');
    await this.billing.handleFlutterwaveEvent(req.body);
    return { received: true };
  }

  /** App Store Server Notifications V2: the body's signedPayload is a JWS signed by Apple. */
  @Public()
  @Post('apple')
  @HttpCode(200)
  async appleHook(@Body() body: { signedPayload?: string }) {
    if (!body?.signedPayload) throw new UnauthorizedException('Missing payload');
    await this.billing.handleAppleNotification(body.signedPayload);
    return { received: true };
  }

  /** Google Play Real-time Developer Notifications, pushed by Cloud Pub/Sub with an OIDC token. */
  @Public()
  @Post('google')
  @HttpCode(200)
  async googleHook(@Headers('authorization') auth: string | undefined, @Body() body: { message?: { data?: string; messageId?: string } }) {
    if (!(await this.google.verifyPushToken(auth))) throw new UnauthorizedException('Bad token');
    const raw = body?.message?.data;
    if (!raw || !body.message?.messageId) return { received: true };
    const data = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    await this.billing.handleGoogleRtdn(body.message.messageId, data);
    return { received: true };
  }
}
