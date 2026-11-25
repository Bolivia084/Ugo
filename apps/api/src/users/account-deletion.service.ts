import { Injectable } from '@nestjs/common';
import { AuditService } from '../common/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const CHILD_EMAIL_DOMAIN = 'children.ugo.local';

/**
 * Deletes an account and its personal data. Attempts, flashcards, devices, tokens,
 * entitlements and links go with it through cascading foreign keys. Payment event
 * records are kept for tax and refund law; they hold store ids, not names or cards.
 * Store subscriptions must still be cancelled by the user in Google Play or the App
 * Store; the app tells them how before they confirm.
 */
@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async deleteUser(userId: string, actorId: string = userId): Promise<void> {
    const links = await this.prisma.parentLink.findMany({ where: { parentId: userId }, include: { child: { select: { id: true, email: true } } } });
    for (const link of links) {
      const otherParents = await this.prisma.parentLink.count({ where: { childId: link.childId, status: 'ACTIVE', parentId: { not: userId } } });
      if (otherParents > 0) continue;
      if (link.child.email.endsWith(`@${CHILD_EMAIL_DOMAIN}`)) {
        await this.prisma.user.delete({ where: { id: link.childId } }); // profile the parent created and controls
      } else {
        await this.prisma.user.update({ where: { id: link.childId }, data: { status: 'PENDING_CONSENT' } });
      }
    }
    await this.prisma.user.delete({ where: { id: userId } });
    await this.audit.log({ actorId: actorId === userId ? null : actorId, action: 'account.deleted', targetType: 'User', targetId: userId });
  }
}
