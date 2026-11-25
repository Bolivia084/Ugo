import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

const registerSchema = z.object({ token: z.string().min(10).max(4096), platform: z.enum(['IOS', 'ANDROID', 'WEB']) });

@Controller('devices')
export class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async register(@CurrentUser() user: AuthUser, @Body({ schema: registerSchema }) body: z.infer<typeof registerSchema>) {
    await this.prisma.deviceToken.upsert({
      where: { token: body.token },
      create: { token: body.token, platform: body.platform, userId: user.id },
      update: { userId: user.id, platform: body.platform },
    });
  }

  @Delete(':token')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId: user.id } });
  }
}
