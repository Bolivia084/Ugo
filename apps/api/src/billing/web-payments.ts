import { BadGatewayException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { hmacHex, safeEqual } from '../common/crypto.js';

export interface PaystackTransaction {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string;
  customer?: { customer_code?: string; email?: string };
  plan?: string | { plan_code?: string } | null;
  plan_object?: { plan_code?: string };
  metadata?: Record<string, unknown> | string | null;
}

/** Paystack (primary web checkout). Card details stay with Paystack; Ugo only sees references and status. */
@Injectable()
export class PaystackClient {
  constructor(@Inject(ENV) private readonly env: Env) {}

  private get key(): string {
    if (!this.env.PAYSTACK_SECRET_KEY) throw new ServiceUnavailableException('Paystack is not configured');
    return this.env.PAYSTACK_SECRET_KEY;
  }

  /** x-paystack-signature is HMAC-SHA512 of the raw request body with the secret key. */
  verifySignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!rawBody || !signature || !this.env.PAYSTACK_SECRET_KEY) return false;
    return safeEqual(hmacHex('sha512', this.env.PAYSTACK_SECRET_KEY, rawBody), signature);
  }

  async initialize(input: { email: string; amountKobo: number; planCode?: string; reference: string; metadata: Record<string, unknown>; callbackUrl: string }) {
    const body: Record<string, unknown> = {
      email: input.email,
      amount: input.amountKobo,
      currency: 'NGN',
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
      channels: ['card', 'bank', 'ussd', 'bank_transfer'],
    };
    if (input.planCode) body.plan = input.planCode;
    const res = await this.call<{ authorization_url: string; reference: string }>('POST', '/transaction/initialize', body);
    return res;
  }

  verify(reference: string) {
    return this.call<PaystackTransaction>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.paystack.co${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; data?: T; message?: string };
    if (!res.ok || !json.status || !json.data) throw new BadGatewayException(`Paystack error: ${json.message ?? res.status}`);
    return json.data;
  }
}

export interface FlutterwaveTransaction {
  id: number;
  tx_ref: string;
  status: string;
  amount: number;
  currency: string;
  customer?: { email?: string };
  meta?: Record<string, unknown> | null;
}

/** Flutterwave (backup web checkout). */
@Injectable()
export class FlutterwaveClient {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Flutterwave sends the secret hash you set in its dashboard in the verif-hash header. */
  verifySignature(header: string | undefined): boolean {
    return Boolean(header && this.env.FLUTTERWAVE_SECRET_HASH && safeEqual(header, this.env.FLUTTERWAVE_SECRET_HASH));
  }

  async createPayment(input: { txRef: string; amountKobo: number; email: string; planId?: string; meta: Record<string, unknown>; redirectUrl: string }) {
    const body: Record<string, unknown> = {
      tx_ref: input.txRef,
      amount: input.amountKobo / 100,
      currency: 'NGN',
      redirect_url: input.redirectUrl,
      customer: { email: input.email },
      meta: input.meta,
    };
    if (input.planId) body.payment_plan = input.planId;
    return this.call<{ link: string }>('POST', '/payments', body);
  }

  verify(id: number) {
    return this.call<FlutterwaveTransaction>('GET', `/transactions/${id}/verify`);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.env.FLUTTERWAVE_SECRET_KEY) throw new ServiceUnavailableException('Flutterwave is not configured');
    const res = await fetch(`https://api.flutterwave.com/v3${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.env.FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; data?: T; message?: string };
    if (!res.ok || json.status !== 'success' || !json.data) throw new BadGatewayException(`Flutterwave error: ${json.message ?? res.status}`);
    return json.data;
  }
}
