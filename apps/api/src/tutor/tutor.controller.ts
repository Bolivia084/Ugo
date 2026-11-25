import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { TutorService } from './tutor.service.js';

const messageSchema = z
  .object({
    examCode: z.enum(['FSLC', 'COMMON_ENTRANCE', 'BECE', 'WAEC', 'NECO', 'JAMB', 'SAT', 'IELTS']).optional(),
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000) }))
      .min(1)
      .max(40)
      .refine((m) => m[0].role === 'user' && m[m.length - 1].role === 'user', 'The conversation must start and end with a learner message'),
  })
  .strict();

@Controller('tutor')
@Roles('LEARNER')
export class TutorController {
  constructor(private readonly tutor: TutorService) {}

  @Get('usage')
  usage(@CurrentUser() user: AuthUser) {
    return this.tutor.usage(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('messages')
  @HttpCode(200)
  send(@CurrentUser() user: AuthUser, @Body({ schema: messageSchema }) body: z.infer<typeof messageSchema>) {
    return this.tutor.reply(user.id, body.messages, body.examCode);
  }
}
