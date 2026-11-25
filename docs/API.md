# API reference

Base URL: `https://api.ugo.ng/api/v1` (staging: `https://api.staging.ugo.ng/api/v1`). Health check: `GET /health` (no prefix).

All requests and responses are JSON. Send `Authorization: Bearer <accessToken>` except on routes marked public. Errors look like `{ "statusCode": 400, "message": "..." }` or, for specific cases, `{ "message": "...", "code": "CONSENT_REQUIRED" }`.

## Auth

| Method and path | Who | What |
| --- | --- | --- |
| `POST /auth/register` | Public | Learner or parent sign up. Learners under 18 must give `parentEmail` and start as `PENDING_CONSENT`. Returns tokens. |
| `POST /auth/login` | Public | Email and password. Returns tokens, or `{ mfaRequired: true, challengeId, method }`. |
| `POST /auth/mfa/verify` | Public | `{ challengeId, code }`. Returns tokens. |
| `POST /auth/refresh` | Public | `{ refreshToken }`. Rotates. Reusing an old token ends the session. |
| `POST /auth/logout`, `POST /auth/logout-all` | Signed in | End this session, or every session |
| `POST /auth/verify-email`, `POST /auth/verify-email/resend` | Signed in | Email confirmation code |
| `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm` | Public | Reset by emailed code |
| `POST /auth/mfa/method`, `POST /auth/mfa/totp/confirm` | Signed in | Switch between email codes and an authenticator app (password required) |

## Account and parents

| Method and path | Who | What |
| --- | --- | --- |
| `GET /me`, `PATCH /me` | Signed in | Profile; change display name or leaderboard choice |
| `DELETE /me` | Signed in | Delete account (`{ password }`) |
| `POST /account/delete` | Public | Deletion from the website |
| `GET /parents/children`, `POST /parents/children` | Parent | List or create child profiles (consent recorded) |
| `POST /parents/consent` | Parent | Approve a learner with the 8 digit emailed code |
| `POST /parents/children/:id/session` | Parent | Tokens to hand the phone to a child profile |
| `PATCH /parents/children/:id` | Parent | `{ allowLeaderboard }` |
| `DELETE /parents/children/:id` | Parent | Withdraw consent (deletes the child's data unless another parent consents or the learner is an adult) |
| `GET /parents/children/:id/progress` | Parent | Child's progress, plans and AI tutor usage |

## Catalogue, content and progress

| Method and path | Who | What |
| --- | --- | --- |
| `GET /catalog` | Public | Exams, subjects and topics (managed in the admin dashboard) |
| `GET /app-config` | Public | Minimum supported version, maintenance message, public key for offline entitlements |
| `GET /content/packs/:examCode` | Signed in | Current pack: full if the user has the plan, otherwise samples. Signed download link for one hour. |
| `GET /content/videos/:id/access` | Signed in | Stream URL, signed cookies, optional download link |
| `POST /sync` | Signed in | `{ attempts[], flashcards[] }`. Idempotent by client id. Scores are worked out on the server. |
| `GET /progress/summary` | Signed in | Streak, trends, subjects, weak topics, recent mocks |
| `GET /leaderboard/:examCode` | Signed in | Display names only |
| `GET /bookmarks`, `PUT /bookmarks/:itemId`, `DELETE /bookmarks/:itemId` | Signed in | Bookmarks |
| `POST /devices`, `DELETE /devices/:token` | Signed in | Push notification tokens |

## Plans and payments

| Method and path | Who | What |
| --- | --- | --- |
| `GET /billing/entitlements` | Signed in | Plans plus the signed copy for offline use |
| `POST /billing/apple/verify` | Signed in | `{ signedTransaction }` from StoreKit 2 |
| `POST /billing/google/verify` | Signed in | `{ purchaseToken, productId }` |
| `POST /billing/restore` | Signed in | `{ apple[], google[] }` |
| `POST /billing/web/checkout` | Learner or parent | `{ examCode, provider, promoCode?, forUserId? }`. Returns a Paystack or Flutterwave checkout link (website only). |
| `POST /billing/promo/redeem` | Signed in | `{ code, examCode, forUserId? }` |
| `POST /webhooks/paystack`, `/webhooks/flutterwave`, `/webhooks/apple`, `/webhooks/google` | Public, signature checked | Payment and store notifications |

## AI tutor

| Method and path | Who | What |
| --- | --- | --- |
| `GET /tutor/usage` | Learner | `{ used, limit }` for today (Lagos time) |
| `POST /tutor/messages` | Learner with a plan | `{ examCode?, messages[] }` (up to 40 turns; the last 20 are sent). Returns `{ reply, declined, used, limit }`. |

## Admin (admin roles, MFA, allowlisted network, audited)

`/admin/content/items` (list, create, edit drafts, duplicate, submit, review, schedule, archive), `/admin/content/packs/:examCode` (list, publish, rollback), `/admin/categories` (edit settings, schedule price changes, add subjects), `/admin/subjects/:id` (hide or show, add topics), `/admin/promo-codes`, `/admin/users` (search, detail, reset MFA, suspend, unsuspend), `/admin/entitlements/:id/revoke`, `/admin/staff`, `/admin/reports/subscriptions`, `/admin/reports/usage`, `/admin/payment-events`, `/admin/audit-log`, `/admin/settings`.
