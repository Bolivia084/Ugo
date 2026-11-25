import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { BlockList, isIP } from 'node:net';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** Admin routes only answer from allowlisted IPs (office VPN or the SSO proxy in front of the dashboard). */
@Injectable()
export class AdminIpGuard implements CanActivate {
  private readonly list: BlockList | null;

  constructor(@Inject(ENV) env: Env) {
    const entries = env.ADMIN_IP_ALLOWLIST.split(',').map((s) => s.trim()).filter(Boolean);
    if (!entries.length) {
      this.list = null;
      return;
    }
    const list = new BlockList();
    for (const e of entries) {
      const [addr, prefix] = e.split('/');
      const type = isIP(addr) === 6 ? 'ipv6' : 'ipv4';
      if (prefix) list.addSubnet(addr, Number(prefix), type);
      else list.addAddress(addr, type);
    }
    this.list = list;
  }

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.list) return true; // development only; production refuses to start without a list
    const ip: string = (ctx.switchToHttp().getRequest().ip ?? '').replace(/^::ffff:/, '');
    const type = isIP(ip) === 6 ? 'ipv6' : 'ipv4';
    if (!ip || !this.list.check(ip, type)) throw new ForbiddenException('Not allowed from this network');
    return true;
  }
}
