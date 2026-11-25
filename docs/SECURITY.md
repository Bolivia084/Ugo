# Security

No app can be guaranteed against every attack. Ugo aims to make attacks hard, spot them quickly and limit the damage. The targets are OWASP MASVS (with resilience controls) for the app and OWASP ASVS Level 2 for the backend. This page lists the controls in the code, and the ones that still need work or an outside party.

## Accounts and access

| Control | Where | Status |
| --- | --- | --- |
| Argon2id password hashing (19 MiB, 2 iterations) | `apps/api/src/auth/auth.service.ts` | Done |
| Same answer and timing for unknown email and wrong password | `auth.service.ts` (dummy hash) | Done, tested |
| Lockout after 5 failed sign ins (15 minutes) | `auth.service.ts` | Done |
| MFA by email code on by default; authenticator app (TOTP) option | `auth.service.ts`, `otp.service.ts`, `common/crypto.ts` | Done, tested (RFC 6238 vector) |
| MFA always required for admin, content staff, support and tutor roles | `MFA_REQUIRED_ROLES` in `packages/shared` | Done |
| SMS codes | | Not wired: needs an SMS provider (see STATUS.md) |
| Biometric unlock on the device | `apps/mobile/src/app/_layout.tsx` | Done |
| 15 minute access tokens, rotating refresh tokens, reuse detection revokes the session | `auth/tokens.service.ts` | Done, tested |
| Role based access control | `common/auth.guard.ts`, `@Roles()` | Done, tested |
| Admin: MFA, IP allowlist (API guard and WAF rule), audit log of every change | `common/admin-ip.guard.ts`, `infra/terraform/modules/edge` | Done |
| Admin single sign on | | Not done: put the admin site behind the company identity provider (DEPLOYMENT.md step 6) |

## Data protection

| Control | Where | Status |
| --- | --- | --- |
| TLS 1.2 minimum, TLS 1.3 preferred, HTTP redirected to HTTPS | ALB policy `ELBSecurityPolicy-TLS13-1-2-2021-06`; CloudFront `TLSv1.2_2021` | Done in Terraform |
| HSTS and security headers | `helmet` in `configure-app.ts`; CloudFront security headers policy | Done |
| Certificate pinning with backup pins and an expiry date | `apps/mobile/src/lib/security.ts` | Done; pins are set per build (DEPLOYMENT.md step 8) |
| Encryption at rest: database (KMS, AES-256), S3 (AES-256), backups (KMS), Redis | Terraform modules | Done in Terraform |
| Extra field encryption (AES-256-GCM) for TOTP secrets | `common/crypto.ts` | Done |
| Tokens only in Keychain or Keystore, device only, no backup | `apps/mobile/src/lib/session.ts`, `allowBackup: false` | Done |
| On device database encrypted (SQLCipher) | `apps/mobile/src/lib/db.ts`, `expo-sqlite` plugin | Done |
| Paid videos: signed, expiring CloudFront cookies; screen capture blocked on the video screen | `content.controller.ts`, `video/[id].tsx` | Done |
| DRM for paid video and encrypted offline video files | | Not done: needs a DRM provider (see STATUS.md) |

## API and infrastructure

| Control | Where | Status |
| --- | --- | --- |
| Every endpoint needs a valid token unless marked public (sign in, sign up, catalogue, signed webhooks) | Global `AuthGuard` | Done, tested |
| Rate limits on every endpoint, stricter on sign in and codes, plus WAF rate rules | `@nestjs/throttler`, `edge` module | Done (per instance; move the limiter store to Redis for many instances) |
| Input validation (Zod, unknown fields rejected) and parameterised queries (Prisma) | Controllers, `StandardSchemaValidationPipe` | Done, tested |
| WAF managed rules and DDoS protection (Shield Standard) | `edge` module | Done in Terraform |
| Databases and Redis in subnets with no internet route | `network` module (isolated subnets) | Done in Terraform |
| Least privilege IAM for the API task and deploy role | `app` module | Done in Terraform |
| Webhook signatures: Paystack HMAC-SHA512, Flutterwave hash, Apple JWS, Google OIDC token | `billing/` | Done (Paystack tested) |
| Purchases verified with Apple and Google before access; purchase tied to the Ugo account | `billing/billing.service.ts` | Done |
| No card data stored or logged | `redactPaystack`, audit scrubbing | Done, tested |
| AI provider key only on the server | `tutor/` | Done |
| Play Integrity and App Attest tokens | Mobile collects tokens (`security.ts`) | Server check not done (see STATUS.md) |
| Rooted or jailbroken device detection limits paid downloads | `security.ts`, video screen | Done |
| Release builds minified and obfuscated (R8 on Android, Hermes bytecode) | `app.config.ts` | Done |
| No secrets in the app | Config only holds public values | Done |

## Monitoring and response

| Control | Where | Status |
| --- | --- | --- |
| Central logs without passwords, tokens or card data | JSON logs to CloudWatch, audit scrubbing, Sentry scrubbing | Done |
| Alerts: errors, latency, database, unusual sign in failures, payment errors | `monitoring` module | Done in Terraform |
| Weekly dependency and container scans | Dependabot, `weekly-security.yml` (Trivy) | Done |
| Independent penetration test before launch and yearly | | Needs an outside firm |
| Responsible disclosure page | `/SECURITY.md`, publish at ugo.ng/security | Text done, website page not built |
| Encrypted daily backups, point in time recovery, quarterly restore test | `database` and `monitoring` modules, MAINTENANCE_PLAN.md | Done in Terraform; restore test is a process |
| Incident response plan with the 72 hour NDPC notice | INCIDENT_RESPONSE.md | Done |
