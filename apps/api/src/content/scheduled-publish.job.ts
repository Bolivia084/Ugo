import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { ContentService } from './content.service.js';

/** Every 15 minutes: publishes a new pack for any exam with scheduled items that are now due. */
@Injectable()
export class ScheduledPublishJob {
  private readonly logger = new Logger(ScheduledPublishJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
  ) {}

  @Cron('*/15 * * * *')
  async run(now = new Date()) {
    const due = await this.prisma.contentItem.findMany({
      where: { status: 'SCHEDULED', scheduledFor: { lte: now } },
      distinct: ['examCategoryId'],
      select: { examCategory: { select: { code: true } }, publishedInPack: true },
    });
    for (const d of due) {
      // Lock per exam so two API instances cannot publish the same version twice.
      const lock = await this.prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(hashtext(${'publish:' + d.examCategory.code})) AS locked`;
      if (!lock[0]?.locked) continue;
      try {
        const r = await this.content.publishPack(d.examCategory.code, 'New study material is ready', 'system', now);
        this.logger.log(`Scheduled publish ${d.examCategory.code} v${r.version}`);
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext(${'publish:' + d.examCategory.code}))`;
      }
    }
  }
}
