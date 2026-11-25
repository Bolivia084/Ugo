import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv, type Env } from './env.js';

export const ENV = Symbol('ENV');

/** Typed, validated settings. Global because nearly every module reads configuration. */
@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
  providers: [{ provide: ENV, useFactory: (): Env => validateEnv(process.env as Record<string, unknown>) }],
  exports: [ENV],
})
export class AppConfigModule {}
