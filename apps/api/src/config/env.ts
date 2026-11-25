import { z } from 'zod';

const optional = z.string().optional().transform((v) => (v ? v : undefined));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ENTITLEMENT_SIGNING_KEY: optional,
  FIELD_ENCRYPTION_KEY: optional,
  CORS_ORIGINS: z.string().default(''),
  ADMIN_IP_ALLOWLIST: z.string().default(''),
  ANTHROPIC_API_KEY: optional,
  TUTOR_MODEL: z.string().default('claude-opus-5-5'),
  PAYSTACK_SECRET_KEY: optional,
  FLUTTERWAVE_SECRET_KEY: optional,
  FLUTTERWAVE_SECRET_HASH: optional,
  WEB_CHECKOUT_CALLBACK_URL: z.string().default('https://ugo.ng/checkout/done'),
  APPLE_BUNDLE_ID: z.string().default('ng.ugo.app'),
  APPLE_APP_ID: z.coerce.number().int().optional(),
  APPLE_ROOT_CERTS_DIR: optional,
  APPLE_ENVIRONMENT: z.enum(['Sandbox', 'Production']).default('Sandbox'),
  GOOGLE_PACKAGE_NAME: z.string().default('ng.ugo.app'),
  GOOGLE_SERVICE_ACCOUNT_JSON: optional,
  GOOGLE_RTDN_AUDIENCE: optional,
  GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL: optional,
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./storage'),
  PUBLIC_API_URL: z.string().default('http://localhost:3000'),
  S3_BUCKET: optional,
  AWS_REGION: z.string().default('eu-west-1'),
  CLOUDFRONT_DOMAIN: optional,
  CLOUDFRONT_KEY_PAIR_ID: optional,
  CLOUDFRONT_PRIVATE_KEY: optional,
  EMAIL_DRIVER: z.enum(['log', 'ses']).default('log'),
  EMAIL_FROM: z.string().default('Ugo <no-reply@ugo.ng>'),
  FCM_SERVICE_ACCOUNT_JSON: optional,
  SENTRY_DSN: optional,
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
    const required: (keyof Env)[] = ['ENTITLEMENT_SIGNING_KEY', 'FIELD_ENCRYPTION_KEY', 'ADMIN_IP_ALLOWLIST'];
    const missing = required.filter((k) => !env[k]);
    if (missing.length) throw new Error(`Missing required settings for ${env.NODE_ENV}: ${missing.join(', ')}`);
    if (env.STORAGE_DRIVER !== 's3') throw new Error('STORAGE_DRIVER must be s3 outside development');
    if (env.EMAIL_DRIVER !== 'ses') throw new Error('EMAIL_DRIVER must be ses outside development');
  }
  return env;
}
