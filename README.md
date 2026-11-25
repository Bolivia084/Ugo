# Ugo

Exam Prep and Study Hub mobile app for school kids and students in Nigeria: FSLC, Common Entrance, BECE, WAEC, NECO, JAMB (UTME), SAT and IELTS. One codebase runs on Android and iOS.

## What is in this repository

| Folder | What it is |
| --- | --- |
| `apps/mobile` | The Ugo app for Android and iOS (Expo, React Native, TypeScript) |
| `apps/api` | The backend API (NestJS on Node.js, PostgreSQL with Prisma) |
| `apps/admin` | The staff dashboard (React, Vite) |
| `packages/shared` | Rules shared by all three: exam catalogue, scoring, plan rules, age rules |
| `infra/terraform` | AWS infrastructure as code (VPC, ECS, RDS, Redis, S3, CloudFront, WAF, alarms, backups) |
| `.github/workflows` | CI, security scans, API and admin deploys, mobile store releases |
| `docs` | Plan, architecture, deployment guide, runbooks and the current status |

Start with [docs/STATUS.md](docs/STATUS.md). It lists what is built and tested, and what still needs accounts, money, legal work or people before launch.

## Run it on your computer

You need Node.js 22 or newer and PostgreSQL 16.

```bash
# 1. Shared rules
cd packages/shared && npm install && npm run build && npm test

# 2. API
cd ../../apps/api
cp .env.example .env            # then edit DATABASE_URL if needed
npm install
npx prisma migrate deploy
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='Choose-a-long-passphrase-1' npm run db:seed
npm run start:dev               # http://localhost:3000/health

# 3. Admin dashboard (in another terminal)
cd ../admin && npm install && npm run dev    # http://localhost:5173

# 4. Mobile app (in another terminal)
cd ../mobile && npm install
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_IP:3000 npx expo run:android   # or run:ios on a Mac
```

The app uses native modules (encrypted database, in app purchases, secure storage), so it needs a development build (`npx expo run:android`, `npx expo run:ios` or `eas build --profile development`). Expo Go is not enough.

In local development, sign in codes are printed in the API log instead of being emailed.

## Tests

```bash
cd packages/shared && npm test        # business rules
cd apps/api && npm test               # unit tests
cd apps/api && npm run test:e2e       # end to end tests against PostgreSQL (uses a fresh schema each run)
cd apps/mobile && npm run typecheck && npm test
cd apps/admin && npm run build
```

## Documents

- [docs/STATUS.md](docs/STATUS.md): what is done, what is left, launch checklist
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the system fits together, mapped to the five part guide
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): step by step deployment guide
- [docs/API.md](docs/API.md): API reference
- [docs/PAYMENTS_RUNBOOK.md](docs/PAYMENTS_RUNBOOK.md): refunds, failed renewals, reconciliation
- [docs/MAINTENANCE_PLAN.md](docs/MAINTENANCE_PLAN.md): monthly content and app releases, approvals, rollback
- [docs/INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md): incident response plan, including the 72 hour NDPC notice
- [docs/SECURITY.md](docs/SECURITY.md): security controls and the OWASP mapping
- [docs/PRIVACY_AND_CHILDREN.md](docs/PRIVACY_AND_CHILDREN.md): NDPA 2023, GDPR and store rules for children
- [SECURITY.md](SECURITY.md): how to report a security problem
