import { Inject, Injectable, Logger } from '@nestjs/common';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Sends email through Amazon SES. In development it only logs the subject and recipient domain. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly ses: SESv2Client | null;
  /** Last messages sent in development and tests, so codes can be read without a mailbox. */
  readonly outbox: EmailMessage[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.ses = env.EMAIL_DRIVER === 'ses' ? new SESv2Client({ region: env.AWS_REGION }) : null;
  }

  async send(msg: EmailMessage): Promise<void> {
    if (msg.to.endsWith('@children.ugo.local')) return; // child profiles without their own email
    if (!this.ses) {
      this.outbox.push(msg);
      if (this.outbox.length > 50) this.outbox.shift();
      // Codes are printed only in local development, never in staging or production (those use SES).
      const detail = this.env.NODE_ENV === 'development' ? ` text="${msg.text.replace(/\s+/g, ' ').slice(0, 200)}"` : '';
      this.logger.log(`[email:log] to=*@${msg.to.split('@')[1]} subject="${msg.subject}"${detail}`);
      return;
    }
    await this.ses.send(
      new SendEmailCommand({
        FromEmailAddress: this.env.EMAIL_FROM,
        Destination: { ToAddresses: [msg.to] },
        Content: { Simple: { Subject: { Data: msg.subject }, Body: { Text: { Data: msg.text } } } },
      }),
    );
  }
}
