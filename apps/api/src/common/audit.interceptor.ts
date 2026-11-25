import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { tap, type Observable } from 'rxjs';
import { AuditService } from './audit.service.js';
import type { AuthUser } from './auth-user.js';

/** Records every state changing admin request: who, what, from where. */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    if (req.method === 'GET') return next.handle();
    const user = req.user as AuthUser | undefined;
    return next.handle().pipe(
      tap(() => {
        void this.audit.log({
          actorId: user?.id,
          action: `${req.method} ${req.route?.path ?? req.url}`,
          targetType: ctx.getClass().name,
          targetId: req.params?.id,
          metadata: { params: req.params, body: req.body },
          ip: req.ip,
        });
      }),
    );
  }
}
