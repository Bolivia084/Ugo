import { Injectable, NotFoundException } from '@nestjs/common';
import type { ExamCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active categories and subjects. The app caches this; staff edit it in the admin dashboard. */
  async list() {
    const cats = await this.prisma.examCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        subjects: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: { topics: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } } },
        },
      },
    });
    return cats.map((c) => ({
      code: c.code,
      name: c.name,
      level: c.level,
      description: c.description,
      minAge: c.minAge,
      disclaimer: c.disclaimer,
      electiveCount: c.electiveCount,
      mockMinutes: c.mockMinutes,
      mockSections: c.mockSections,
      // Web checkout price only. The apps always show the price the store returns.
      webPriceKobo: c.priceKobo,
      appleProductId: c.appleProductId,
      googleProductId: c.googleProductId,
      subjects: c.subjects.map((s) => ({ id: s.id, name: s.name, slug: s.slug, topics: s.topics })),
    }));
  }

  async byCode(code: ExamCode) {
    const c = await this.prisma.examCategory.findUnique({ where: { code } });
    if (!c || !c.isActive) throw new NotFoundException('Unknown exam');
    return c;
  }

  /** Price that applies to a purchase or renewal made now, honouring the notice period for changes. */
  effectivePriceKobo(c: { priceKobo: number; pendingPriceKobo: number | null; pendingPriceFrom: Date | null }, now = new Date()): number {
    if (c.pendingPriceKobo != null && c.pendingPriceFrom && c.pendingPriceFrom <= now) return c.pendingPriceKobo;
    return c.priceKobo;
  }
}
