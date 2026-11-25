# Ugo architecture

This page explains how Ugo is built, following the five part guide: user interface and experience, the app code, the backend, security, and growth and operations.

```
 Phones (Android, iOS)            Staff browser             Ugo website (web checkout)
   apps/mobile                     apps/admin                    (to be built)
       |                               |                              |
       |  HTTPS, TLS 1.2+, pinned      |  HTTPS, MFA, IP allowlist    |
       v                               v                              v
  CloudFront (media)   <---- AWS WAF + Application Load Balancer ---->  apps/api (NestJS on ECS Fargate)
  S3 (packs, videos)                                                    |        |        |
                                                       PostgreSQL (RDS)  Redis   Store, payment and AI APIs
                                                       private subnets          (Apple, Google, Paystack,
                                                                                 Flutterwave, Anthropic, FCM/APNs)
```

## 1. User interface and experience

- **Screens** live in `apps/mobile/src/app` (Expo Router, one file per screen). Learner tabs: Home, Practice, Mock exams, Progress, Me. Parents get their own area (`parent/`).
- **Design**: deep blue and white with green and gold accents, light and dark mode (`src/theme/theme.ts`). Text uses the phone's font size setting, buttons are at least 48 points tall, and every control has a screen reader label.
- **Flows**: welcome, sign up (learner or parent), email check, sign in with a second step, parent consent for learners under 18, choosing exams, practice, timed mocks, results, notes, flashcards, videos, AI tutor, plans, account deletion.
- **Interruptions and edge cases**: offline use, mock timers that keep running in the background like the real exam, a guard against leaving a mock by accident, a forced update screen, a biometric lock, and clear messages when a plan is needed.
- **Low cost phones**: the first download holds no exam content; each exam's pack is fetched on demand and stored in SQLite. Images ask for smaller sizes in data saver mode.

## 2. Frontend and client code

- **App code**: React Native with Expo SDK 58 and TypeScript, one codebase for Android and iOS.
- **Local storage and caching**: an SQLCipher encrypted SQLite database (`src/lib/db.ts`) holds content packs, results waiting to sync, custom flashcards and cached data. The key is random per install and kept in the Keychain or Keystore. Tokens are only in secure storage (`src/lib/session.ts`).
- **Offline sync** (`src/lib/sync.ts`): every finished attempt is saved on the phone first with a client id, then sent to `/sync`. The server ignores ids it already has, so nothing is lost or doubled.
- **Content packs** (`src/lib/packs.ts`): versioned, gzipped JSON, checked against a SHA-256 hash before anything is replaced. A rollback on the server makes phones fall back to the earlier version.
- **Third party modules**: `expo-iap` (Google Play Billing and StoreKit 2), `@expo/app-integrity` (Play Integrity and App Attest), `react-native-ssl-public-key-pinning`, `jail-monkey`, `expo-video`, `expo-notifications`, `@noble/curves` (checks the signed offline entitlement), `fflate`.

## 3. Backend, APIs and database

- **Backend**: NestJS 12 on Node.js (`apps/api`), one module per feature: `auth`, `users` (and parents), `catalog`, `content`, `progress`, `billing`, `tutor`, `notifications`, `admin`.
- **APIs**: REST under `/api/v1`, validated with Zod schemas on every request. See [API.md](API.md).
- **Database**: PostgreSQL 16 through Prisma (`apps/api/prisma/schema.prisma`). Key tables: `User`, `ParentLink`, `ConsentRequest`, `ExamCategory`, `Subject`, `Topic`, `ContentItem`, `ContentPack`, `Attempt`, `Entitlement`, `PaymentEvent`, `TutorUsage`, `AuditLog`, `Setting`.
- **Business rules shared everywhere** are in `packages/shared`: the exam catalogue seed, scoring and weak topics, plan access rules, renewal reminders, age rules, version checks.
- **Content is data**: exam categories, subjects, topics, prices, mock timings, store product ids and tutor limits are all rows that staff change in the admin dashboard, with no app release.
- **Background jobs** (`@nestjs/schedule`): renewal reminders every morning (Lagos time) and scheduled content publishing every 15 minutes, protected by a database lock.

## 4. Security and authentication

- Passwords hashed with Argon2id. Email code MFA on by default, authenticator apps as an option, MFA always on for staff. Lockout after repeated failures.
- 15 minute access tokens and rotating refresh tokens with reuse detection (`auth/tokens.service.ts`).
- Role based access for learner, parent, tutor, content staff, support and admin (`common/auth.guard.ts`).
- Admin routes need an admin role, MFA, an allowlisted network (checked in the API and in the WAF) and every change is written to the audit log.
- Signed payment webhooks, server verification of every store purchase, no card data anywhere.
- Encryption in transit (TLS 1.2 minimum, 1.3 preferred, HTTP redirected) and at rest (RDS with KMS, S3 with AES-256, SQLCipher on the phone, AES-256-GCM for TOTP secrets).
- Full details and the OWASP mapping: [SECURITY.md](SECURITY.md).

## 5. Growth, operations and maintenance

- **Notifications**: push through Expo's push service (FCM on Android, APNs on iOS) and email through Amazon SES, for renewal reminders 7 days before renewal and consent requests.
- **Analytics and crash monitoring**: Sentry on the API (personal data stripped), CloudWatch metrics, logs and alarms. Usage and learner performance reports in the admin dashboard. No third party advertising or ad tracking.
- **Admin panel**: `apps/admin` covers content workflow, packs and rollback, exams and subjects, prices with notice periods, promo codes, revenue and plan reports, payment events, user support, staff accounts, usage, audit log and settings.
- **Testing, deployment and updates**: GitHub Actions run tests, scans and Terraform checks on every pull request; API deploys to ECS with migrations; mobile builds through EAS Build and EAS Submit; monthly releases and content updates follow [MAINTENANCE_PLAN.md](MAINTENANCE_PLAN.md).
