import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isDueForRenewalReminder, RENEWAL_REMINDER_DAYS } from '@ugo/shared';
import { EmailService } from '../notifications/email.service.js';
import { PushService } from '../notifications/push.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Daily: reminds users 7 days before a plan renews (push and email), and marks plans
 * whose time has run out as expired. Runs on every API instance, but a reminder is sent
 * once: the row is claimed with a conditional update first.
 */
@Injectable()
export class RenewalRemindersJob {
  private readonly logger = new Logger(RenewalRemindersJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  @Cron('0 8 * * *', { timeZone: 'Africa/Lagos' })
  async run(now = new Date()): Promise<{ reminded: number; expired: number }> {
    const horizon = new Date(now.getTime() + RENEWAL_REMINDER_DAYS * 86_400_000);
    const due = await this.prisma.entitlement.findMany({
      where: { status: 'ACTIVE', autoRenew: true, expiresAt: { gt: now, lte: horizon } },
      include: { user: { select: { email: true, displayName: true, parentLinks: { where: { status: 'ACTIVE' }, include: { parent: { select: { id: true, email: true } } } } } } },
    });
    let reminded = 0;
    for (const e of due) {
      if (!isDueForRenewalReminder({ status: e.status, autoRenew: e.autoRenew, expiresAt: e.expiresAt.toISOString() }, now)) continue;
      const claimed = await this.prisma.entitlement.updateMany({ where: { id: e.id, OR: [{ reminderSentFor: null }, { reminderSentFor: { not: e.expiresAt } }] }, data: { reminderSentFor: e.expiresAt } });
      if (claimed.count !== 1) continue;
      const date = e.expiresAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
      const text = `The ${e.examCode} plan for ${e.user.displayName} renews on ${date}. To stop it renewing, cancel in ${storeName(e.source)} before then. Access continues until the end of the paid year.`;
      // Parents usually pay, so they get the reminder too.
      const recipients = [{ id: e.userId, email: e.user.email }, ...e.user.parentLinks.map((l) => l.parent)];
      for (const r of recipients) {
        await this.push.sendToUser(r.id, 'Your Ugo plan renews soon', text, { type: 'RENEWAL_REMINDER', examCode: e.examCode });
        await this.email.send({ to: r.email, subject: `Your Ugo ${e.examCode} plan renews on ${date}`, text });
      }
      reminded += 1;
    }
    const expired = await this.prisma.entitlement.updateMany({ where: { status: { in: ['ACTIVE', 'CANCELLED', 'GRACE_PERIOD', 'BILLING_RETRY'] }, expiresAt: { lt: new Date(now.getTime() - 3 * 86_400_000) } }, data: { status: 'EXPIRED' } });
    if (reminded || expired.count) this.logger.log(`Renewal reminders sent: ${reminded}; plans expired: ${expired.count}`);
    return { reminded, expired: expired.count };
  }
}

function storeName(source: string): string {
  return source === 'APPLE' ? 'your App Store subscriptions' : source === 'GOOGLE' ? 'Google Play subscriptions' : 'your Ugo account on the website';
}
