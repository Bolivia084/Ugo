import { Global, Module } from '@nestjs/common';
import { AdminIpGuard } from './admin-ip.guard.js';
import { AuditService } from './audit.service.js';
import { AdminAuditInterceptor } from './audit.interceptor.js';

@Global()
@Module({ providers: [AuditService, AdminIpGuard, AdminAuditInterceptor], exports: [AuditService, AdminIpGuard, AdminAuditInterceptor] })
export class CommonModule {}
