# Deployment guide

Follow these steps in order the first time. Each environment (development, staging, production) has its own AWS resources, database, keys and store products.

## 0. Accounts you need first

| Account | Why | Notes |
| --- | --- | --- |
| AWS (organisation account, one sub account per environment) | Hosting | Turn on MFA for every human user |
| Domain `ugo.ng` and DNS | API, website, email | Records for `api.`, `api.staging.`, `cdn.`, `admin.` |
| Apple Developer Program, as an organisation | App Store | Needs a D-U-N-S number for the company |
| Google Play Console, organisation developer account | Google Play | Organisation accounts need verification of the business |
| Expo (EAS) | Builds, submissions, over the air bug fixes | Create the project and note its project id |
| Paystack business account (and Flutterwave as backup) | Web checkout | Complete business verification for live keys |
| Anthropic API | AI tutor | Key stays on the server only |
| Sentry | Crash and error reporting | One project for the API, one for the app |
| GitHub environments `staging` and `prod` | Deploys | Add required reviewers on `prod` |

Enrol Ugo in the Apple App Store Small Business Program and confirm the Google Play reduced service fee tier for the developer account, so store commission is lower in the first year. Check the current rules and rates on each store's site before budgeting.

## 1. Pick the AWS region

The Terraform default is `af-south-1` (Cape Town). Before going live, measure API latency from Lagos, Abuja and Port Harcourt to `af-south-1` and to the nearest European regions, and choose the lowest. CloudFront serves media from edge locations close to users either way.

## 2. Bootstrap Terraform state (once per AWS account)

Create an S3 bucket for Terraform state with versioning and encryption turned on, and block public access. Then for each environment:

```bash
cd infra/terraform/envs/staging
cp backend.hcl.example backend.hcl        # fill in the state bucket name
cp staging.tfvars.example staging.tfvars  # fill in the values below
terraform init -backend-config=backend.hcl
terraform plan -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars
```

Values you need in the tfvars file:

- `api_certificate_arn`: request an ACM certificate for `api.staging.ugo.ng` (or `api.ugo.ng`) in the same region and validate it by DNS.
- `cloudfront_signing_public_key_pem`: generate an RSA key pair (`openssl genrsa -out cf.pem 2048 && openssl rsa -in cf.pem -pubout -out cf.pub`). The public key goes here, the private key goes into the API secret in step 3.
- `admin_allowed_cidrs`: the office or VPN addresses staff use for the admin dashboard.
- `alert_email`: where alarms go. Confirm the SNS email subscription when it arrives.

## 3. Set the API secrets

Terraform creates an empty secret called `ugo-<env>/api` in Secrets Manager. Fill it with a JSON object (use the AWS console or CLI, never commit it):

| Key | How to make it |
| --- | --- |
| `DATABASE_URL` | `postgresql://ugo_admin:PASSWORD@DB_ENDPOINT:5432/ugo?sslmode=require` using the RDS managed master secret, or better a dedicated app user with only the rights it needs |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `ENTITLEMENT_SIGNING_KEY` | `npm run keys:entitlement` in `apps/api` (keep a copy in your password manager) |
| `FIELD_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `PAYSTACK_SECRET_KEY` | Paystack dashboard, live key for production only |
| `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_SECRET_HASH` | Flutterwave dashboard; the hash is the one you set for webhooks |
| `ANTHROPIC_API_KEY` | Anthropic console |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud service account linked in Play Console with access to orders and subscriptions |
| `FCM_SERVICE_ACCOUNT_JSON` | Only if you send raw FCM tokens; Expo push tokens do not need it |
| `CLOUDFRONT_PRIVATE_KEY` | The private key from step 2 |
| `SENTRY_DSN` | Sentry project settings |

Also set these non secret variables on the ECS task through Terraform or the task definition: `CORS_ORIGINS` (the admin site and website origins), `PUBLIC_API_URL`, `APPLE_BUNDLE_ID`, `APPLE_APP_ID`, `APPLE_ROOT_CERTS_DIR` (bake Apple's root certificates from https://www.apple.com/certificateauthority/ into the image or a mounted path), `GOOGLE_PACKAGE_NAME`, `GOOGLE_RTDN_AUDIENCE`, `GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL`, `WEB_CHECKOUT_CALLBACK_URL`, `EMAIL_FROM`, `TUTOR_MODEL`.

The API refuses to start in staging or production without the signing key, the field encryption key and the admin IP allowlist, and without S3 and SES configured.

## 4. Email

Verify the `ugo.ng` domain in Amazon SES (DKIM and SPF records, plus a DMARC record), and request production access so SES can send to any address. Sign in codes, consent requests and renewal reminders all go through SES.

## 5. First API deploy

1. In GitHub, set the repository variables used by `deploy-api.yml`: `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN` (an IAM role GitHub can assume through OIDC, allowed to push to ECR and update the ECS service only), `ECR_REPOSITORY_URL`, `PRIVATE_SUBNETS`, `API_SECURITY_GROUP`.
2. Run the "Deploy API" workflow for `staging`. It builds the image, runs `prisma migrate deploy` as a one off task, then rolls out the new version and waits until it is healthy.
3. Seed the catalogue and the first admin once, from a one off ECS task: `SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... SEED_STARTER_CONTENT=false npx tsx prisma/seed.ts`. In production, keep `SEED_STARTER_CONTENT=false` so only reviewed content goes live.
4. Point `api.staging.ugo.ng` at the load balancer (DNS alias record) and check `https://api.staging.ugo.ng/health`.

## 6. Admin dashboard

Run "Deploy admin dashboard". It builds `apps/admin` with `VITE_API_URL` and uploads it to the admin site bucket. Serve that bucket through CloudFront on `admin.ugo.ng`. For single sign on, put the admin site behind your identity provider (for example AWS IAM Identity Center, Google Workspace or Microsoft Entra ID through an OIDC aware proxy) as well as the API's own MFA and IP allowlist.

## 7. Store products and plans

Create one auto renewing yearly subscription per exam category, then copy each product id into the admin dashboard (Exams and subjects, Manage, Plan and mock settings).

**App Store Connect**: create eight subscription groups, one per exam, each with one yearly subscription, so a learner can hold WAEC and JAMB at the same time. Set prices on the Nigeria storefront. If 5,000 or 7,000 naira is not an exact price point, choose the nearest one. Add the subscription terms, privacy policy link and the in app account deletion path to the app's review notes. Set the App Store Server Notifications V2 URL to `https://api.ugo.ng/api/v1/webhooks/apple` (and the sandbox URL to staging).

**Google Play Console**: create eight subscriptions, each with a yearly base plan priced in naira. Set up Real-time Developer Notifications: create a Pub/Sub topic, grant Google Play permission to publish to it, and add a push subscription to `https://api.ugo.ng/api/v1/webhooks/google` with authentication turned on (the service account and audience you set as `GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_RTDN_AUDIENCE`). Link the Google Cloud project to Play Console for the Developer API and Play Integrity.

**Paystack**: create one yearly plan per exam in naira, copy each plan code into the admin dashboard, and set the webhook URL to `https://api.ugo.ng/api/v1/webhooks/paystack`. Do the same in Flutterwave with `.../webhooks/flutterwave` and the secret hash.

## 8. Mobile builds

1. In `apps/mobile`, run `npx eas-cli@latest init` to link the project, and set `EAS_PROJECT_ID`.
2. Add EAS environment variables per profile: `ENTITLEMENT_PUBLIC_KEY` (from `GET /api/v1/app-config` on that environment), `API_SSL_PINS` (at least two SPKI SHA-256 pins: the current certificate key and a backup key you hold offline), `API_SSL_PINS_EXPIRE` (a date a little after the backup key's planned use), `GOOGLE_CLOUD_PROJECT_NUMBER`, `EAS_UPDATE_URL`.
3. Upload the APNs key and the FCM credentials to EAS for push notifications.
4. Build staging: run the "Mobile release" workflow with `build-staging`, install on test phones, and test every item in the launch checklist.
5. Production: run `build-and-submit-production`. Google Play uses Play App Signing (EAS uploads the upload key). The build targets Android API level 36. iOS builds use the Xcode and iOS SDK that EAS provides; check Apple's current minimum SDK rule at submission time.

## 9. Store listings and reviews

- **Google Play**: complete Data safety, content rating, target audience (include under 13 age groups), Families policy declarations, and run closed testing for the period your account type requires before production.
- **App Store**: complete App Privacy details and the age rating, describe subscriptions clearly, show prices and terms before purchase, keep Restore purchases and account deletion easy to find, and beta test with TestFlight.
- Both: privacy policy and terms on `ugo.ng`, support email, screenshots, icon and description. SAT and IELTS listings must carry the "not affiliated" statement.

## 10. Before launch

Work through the launch checklist in [STATUS.md](STATUS.md).
