import { Inject, Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Push notifications through Firebase Cloud Messaging (HTTP v1). FCM delivers to
 * Android directly and to iOS through APNs, using the APNs key uploaded to Firebase.
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
    const devices = await this.prisma.deviceToken.findMany({ where: { userId } });
    if (!this.auth) {
      this.logger.log(`[push:log] user=${userId} devices=${devices.length} title="${title}"`);
      return devices.length;
    }
    const client = await this.auth.getClient();
    let sent = 0;
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
}
