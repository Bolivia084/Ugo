# Maintenance plan

Ugo is updated in two streams: content every month without an app release, and a new app version every month. Critical security fixes do not wait.

## Roles

| Role | Who | Approves |
| --- | --- | --- |
| Content writer | Content staff | Creates drafts |
| Subject expert reviewer | Content staff (a different person) | Approves or sends back each item |
| Content lead | Admin | Publishes packs, rolls back |
| Release manager | Engineering lead | App releases, OTA fixes |
| Security lead | Engineering lead or CTO | Security fixes, minimum version changes |

## Content updates (monthly, no app release)

1. **Week 1 to 3, drafts**: writers add questions, notes, flashcards and videos in the admin dashboard. Every question has a worked explanation. Past exam questions are only added when Ugo holds written permission or a licence, with the licence reference in the rights note.
2. **Review**: a second subject expert approves or sends back each item. The system does not let a writer approve their own item.
3. **Schedule**: approved items can be scheduled for a release date. Scheduled items are published automatically when due.
4. **Publish**: the content lead publishes a new pack per exam with a short "What's new" line. Each publish creates a new version number for the full pack and the free sample pack.
5. **Delivery**: phones download new packs in the background on Wi-Fi by default and show "What's new" only after a successful download.
6. **Roll back**: if a pack has a mistake, an admin presses Roll back latest. Phones return to the previous version on their next check, and the items from the bad pack go back to Approved for fixing.
7. **Recommendations**: once a month, review anonymised, aggregated scores per topic (Usage report) and adjust the weak topic threshold, sample sets and mock blueprints where learners struggle.

## App releases (monthly)

1. Create a release branch. Update dependencies (Dependabot pull requests from the month), apply bug fixes, security patches and UI improvements.
2. CI must pass: unit and end to end tests, type checks, bundle builds, Terraform checks and security scans.
3. Build staging with the Mobile release workflow and test on at least one low cost Android phone (2 GB RAM), one recent Android phone and one iPhone. Run through the launch checklist items that the change touches.
4. Build and submit production. Roll out in stages: Google Play staged rollout (for example 10 percent, then 50 percent, then 100 percent over a week) and App Store phased release.
5. Watch the Sentry crash free rate and the API alarms during rollout. Halt the rollout if crash free sessions drop below 99.5 percent.
6. After full rollout, raise `latestVersion` in the admin settings.

## Over the air (OTA) bug fixes

- Allowed only for small JavaScript bug fixes between releases, through the `ota-bugfix-production` action of the Mobile release workflow.
- Never use OTA to add features or change what the app does. Store rules require new features to go through review.
- OTA updates are tied to the app version (runtime version policy), so they only reach phones running the same version.

## Security fixes

- Critical fixes go out immediately, as an API deploy, an OTA fix if the issue is in JavaScript, or an expedited store release.
- If old app versions are unsafe, raise `minSupportedVersion` in the admin settings. Users on older versions are asked to update before continuing.

## Backups and restores

- RDS keeps daily snapshots and point in time recovery (14 days) and AWS Backup keeps 35 days in an encrypted vault.
- Every quarter, restore the latest production backup into a temporary database, run `npx prisma migrate status` and a few read queries, record the time it took, then delete the temporary database. Note the result in the operations log.

## Other recurring work

| When | What |
| --- | --- |
| Weekly | Review Dependabot and scan results; merge safe updates |
| Monthly | Content release; app release; payment reconciliation |
| Quarterly | Backup restore test; review admin and staff access; rotate staff passwords where needed |
| Yearly | Independent penetration test; renew the CloudFront signing key and certificate pins; review the privacy policy and NDPC filings |
| Each Expo SDK release | Plan the upgrade within two months (`npx expo install --fix`), test fully, ship as a normal release |
