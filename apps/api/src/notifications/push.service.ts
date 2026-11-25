import { Inject, Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Push notifications. The app registers Expo push tokens: the Expo push service delivers
 * them through FCM (Android) and APNs (iOS) with Ugo's own credentials uploaded to EAS.
 * Raw FCM registration tokens are also supported (Firebase Cloud Messaging HTTP v1).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly auth: GoogleAuth | null;
  private readonly projectId: string | null;

  constructor(
    @Inject(ENV) env: Env,
    private readonly prisma: PrismaService,
  ) {
    if (env.FCM_SERVICE_ACCOUNT_JSON) {
      const credentials = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
      this.projectId = credentials.project_id;
      this.auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    } else {
      this.auth = null;
      this.projectId = null;
    }
  }

  async sendToUser(userId: string, title: string, body: string, data: Record<string, string> = {}): Promise<number> {
    const all = await this.prisma.deviceToken.findMany({ where: { userId } });
    const expo = all.filter((d) => d.token.startsWith('ExponentPushToken['));
    const devices = all.filter((d) => !d.token.startsWith('ExponentPushToken['));
    let sent = expo.length ? await this.sendExpo(expo.map((d) => d.token), title, body, data) : 0;
    if (!devices.length) return sent;
    if (!this.auth) {
      this.logger.log(`[push:log] user=${userId} devices=${devices.length} title="${title}"`);
      return devices.length;
    }
    const client = await this.auth.getClient();
    for (const d of devices) {
      try {
        await client.request({
          url: `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
          method: 'POST',
          data: { message: { token: d.token, notification: { title, body }, data } },
        });
        sent += 1;
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 404 || status === 400) await this.prisma.deviceToken.delete({ where: { token: d.token } }).catch(() => undefined);
        else this.logger.warn(`Push failed with status ${status ?? 'unknown'}`);
      }
    }
    return sent;
  }

  private async sendExpo(tokens: string[], title: string, body: string, data: Record<string, string>): Promise<number> {
    if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
      this.logger.log(`[push:expo:log] devices=${tokens.length} title="${title}"`);
      return tokens.length;
    }
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, data, sound: null }))),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { status: string; details?: { error?: string } }[] };
    const results = json.data ?? [];
    for (const [i, r] of results.entries()) {
      if (r.details?.error === 'DeviceNotRegistered') await this.prisma.deviceToken.delete({ where: { token: tokens[i] } }).catch(() => undefined);
    }
    return results.filter((r) => r.status === 'ok').length;
  }
}
