# Status

Last updated: 25 November 2026.

This page is the honest picture of where Ugo stands against the build brief. The code for the app, backend, admin dashboard and infrastructure is written and tested here. Going live also needs accounts, money, legal work, licences, outside testers and real devices, which code alone cannot do.

## Built and tested in this repository

| Area | What exists | How it was checked |
| --- | --- | --- |
| Shared rules | Exam catalogue for all 8 exams with prices, scoring with weak topics and recommendations, plan access and renewal rules, age and leaderboard rules, version checks | 8 unit tests |
| Backend API | Sign up and sign in with Argon2id, email code MFA, TOTP, lockout, rotating refresh tokens with reuse detection; parent accounts, consent codes, child profiles; catalogue as data; content workflow with second person review, versioned packs, scheduling and rollback; offline sync with server side scoring; progress, streaks, leaderboards; entitlements for Apple, Google, Paystack, Flutterwave and promo codes; signed offline entitlements; renewal reminders; AI tutor with age bands, safety rules and daily limits; admin API with audit log; account deletion | 16 unit tests and 14 end to end tests against PostgreSQL, lint and type checks; production style install boots |
| Mobile app | All learner and parent screens listed in ARCHITECTURE.md, encrypted offline database, pack downloads with hash checks, timed mocks, store billing with restore, certificate pinning, biometric lock, forced updates, data saver, dark mode | Type check, 4 unit tests, Android and iOS JavaScript bundles build, Android native project generates with target API 36, SQLCipher, R8 and no cleartext traffic |
| Admin dashboard | Content workflow, packs and rollback, exams and subjects, plan settings and price changes, promo codes, revenue and plan reports, payment events, user support (plans, MFA reset, suspend, end plan), staff accounts, usage, audit log, settings | Production build; signed in with MFA and browsed in a headless browser (screenshots in `docs/screenshots`) |
| Infrastructure | Terraform for VPC with isolated database subnets, RDS PostgreSQL Multi-AZ with KMS, Redis, ECS Fargate with auto scaling, HTTPS load balancer, S3 and CloudFront with signed access, WAF, alarms, AWS Backup, per environment roots | `terraform fmt` clean. `terraform validate` needs the provider registry, which this build environment could not reach: CI runs it |
| CI/CD | Tests and scans on every pull request, weekly scans, API deploy with migrations, admin deploy, EAS build, submit and OTA workflows, Dependabot | Written, not yet run on GitHub |
| Documents | Architecture, deployment guide, API reference, payments runbook, maintenance plan, incident response plan, security, privacy and children | Written |

## Decisions that differ from the brief

1. **Authentication is built into the API instead of Auth0.** The brief names Auth0 (Supabase Auth as an alternative). The API implements every security requirement in the brief itself (Argon2id, MFA, short tokens with rotation and reuse detection, roles), so there is no extra vendor or per user cost. If you still want Auth0, the auth module can be swapped behind the same endpoints. Please confirm which you prefer.
2. **Push notifications use the Expo push service**, which delivers through FCM on Android and APNs on iOS with Ugo's own credentials. Raw FCM tokens are also supported by the server.
3. **The AI tutor uses Anthropic's Claude (`claude-opus-5-5` by default, set by `TUTOR_MODEL`).** It runs at low effort for fast chat replies and has the server side fallback turned on for declined requests. A smaller model such as `claude-haiku-5-5` would cost much less per message; that is a pricing decision for you.
4. **Region default is `af-south-1` (Cape Town)**, to be confirmed by latency tests from Nigerian cities.

## Not built yet (engineering work still to do)

| Item | Why it matters | Suggested approach |
| --- | --- | --- |
| Server check of Play Integrity and App Attest tokens | Brief asks to reject tampered apps | Add an endpoint that verifies Play Integrity tokens with Google's decode API and App Attest attestations with Apple's root certificate; require it on purchase verify and pack download |
| SMS OTP | Optional MFA method in the brief | Choose a Nigerian SMS provider, add a sender, enable the option |
| Admin single sign on | Brief asks for SSO on the admin dashboard | Put the admin site and admin API behind the company identity provider (DEPLOYMENT.md step 6) |
| DRM for paid video and encrypted offline video | Brief asks for DRM and encrypted downloads that only play in Ugo | Use a DRM provider (Widevine and FairPlay) with a player that supports offline licences; today downloads sit in the app's private storage, unencrypted |
| Video upload and transcoding | Staff need to add videos | S3 upload from the admin dashboard and AWS Elemental MediaConvert to HLS |
| Admin editors for flashcards, short answer and essay questions, videos | Staff can create these through the API but the dashboard form only covers multiple choice and notes | Extend the New item form |
| IELTS Listening audio and Speaking practice | IELTS needs audio and a microphone | Add an audio content type; Speaking would need the microphone permission and a review of children's privacy |
| Adaptive SAT modules | The digital SAT changes module 2 based on module 1 | Mock sections are fixed today; add routing by module 1 score |
| Redis use in the API | Rate limits are per instance | Use Redis as the rate limiter store and cache |
| Data saver image resizing on the CDN | The app asks for smaller images, the CDN must serve them | CloudFront Function or Lambda@Edge image resizing |
| Ugo website | Web checkout, privacy policy, terms, account deletion page, security page | Small site on ugo.ng using the existing API |
| Recommendation engine retuning | Brief asks for monthly retuning | Today it is rule based (weak topics under 60 percent); add a monthly job over aggregated data |
| Load test at 10 times launch traffic | Launch checklist | k6 or Artillery against staging |
| Device testing | Only bundles were built here; no emulator or phone was available | Run development builds on a 2 GB RAM Android phone, a recent Android phone and an iPhone |

## Needs you (accounts, money, legal, people)

- AWS account, domain and DNS, SES production access.
- Apple Developer Program as an organisation (D-U-N-S number), Google Play organisation account, Expo account.
- Store products: eight yearly subscriptions per store, Nigeria prices, notification URLs (DEPLOYMENT.md step 7), small business fee programmes.
- Paystack and Flutterwave business accounts, plans and webhooks.
- Anthropic, Sentry and SMS provider accounts and keys.
- **Content rights**: written permission or licences from WAEC, NECO and JAMB before publishing their past questions, or original questions that follow the syllabus. SAT and IELTS material must be original. Videos must be made by Ugo or licensed.
- **Content**: questions, notes, videos and flashcards for every subject. The repository only has a small set of original starter questions for development.
- **Official timings**: mock timings are editable in the admin dashboard; check every paper against the exam body's current rules (all are marked for checking in the seed data).
- **Legal**: privacy policy, terms, children's notice, DPO, NDPC registration check, data protection impact assessment, processor agreements.
- **Penetration test** by an independent firm, and fixing all high and critical findings.
- **Closed beta** with real learners from each exam level, and parents.

## Launch checklist

- [ ] Penetration test passed, all high and critical issues fixed
- [ ] Load test at 10 times expected launch traffic
- [ ] Purchase, renewal, cancellation and refund tested in both store sandboxes and Paystack test mode, for every exam
- [ ] Offline mode, sync, account deletion and backup restore tested on real phones
- [ ] Closed beta with learners from each exam level; issues fixed
- [ ] Privacy policy, terms, support email and store listings (icon, screenshots, description) ready
- [ ] Google Play: Data safety, content rating, target audience, Families policy, closed testing period
- [ ] App Store: App Privacy, age rating, subscription disclosures, TestFlight beta
- [ ] Certificate pins and entitlement public key set in the production build
- [ ] Minimum supported version and alerts confirmed in production

## Acceptance criteria from the brief

| Criterion | Where it stands |
| --- | --- |
| Ugo is live on both stores | Needs the accounts, store setup and reviews above |
| Sign up, parent consent, pay for any of the eight plans at the right price, unlock within one minute | Built: consent and unlock are tested end to end with Paystack; store purchases unlock as soon as the server verifies them. Needs live store products to prove on devices |
| Several plans at once | Built and tested |
| Paid content works offline | Built: packs in the encrypted database and a signed offline entitlement (signature checks tested) |
| First monthly content update without an app release | Built: publish and rollback tested end to end; needs real content |
| Penetration test shows no open high or critical issues | Needs the outside test |
