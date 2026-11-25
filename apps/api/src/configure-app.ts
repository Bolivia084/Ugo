import { type INestApplication, StandardSchemaValidationPipe, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so both run the same pipeline. */
export function configureApp(app: INestApplication, corsOrigins: string) {
  const express = app as NestExpressApplication;
  express.set('trust proxy', 1); // one load balancer in front
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '1mb' });
  app.use(helmet({ hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true } }));
  app.enableCors({
    origin: corsOrigins.split(',').map((s) => s.trim()).filter(Boolean),
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableShutdownHooks();
  return app;
}
