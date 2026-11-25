import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { validateEnv } from './config/env.js';

const env = validateEnv(process.env as Record<string, unknown>);

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) delete event.request.headers.authorization;
      }
      return event;
    },
  });
}

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  rawBody: true, // needed to check payment webhook signatures
  logger: new ConsoleLogger({ json: env.NODE_ENV !== 'development', logLevels: ['log', 'warn', 'error', 'fatal'] }),
});
configureApp(app, env.CORS_ORIGINS);
await app.listen(env.PORT);
