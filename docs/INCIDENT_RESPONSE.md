# Incident response plan

This plan covers security incidents (for example a data breach, account takeover, leaked key or compromised server) and serious outages.

## Contacts

Fill these in before launch and keep them current.

| Role | Name | Phone | Backup |
| --- | --- | --- | --- |
| Incident lead (CTO or engineering lead) | | | |
| Data protection officer (DPO) | | | |
| Legal counsel | | | |
| Communications | | | |
| AWS support (Business plan or higher recommended) | | | |

## Severity

| Level | Examples | Response |
| --- | --- | --- |
| SEV1 | Personal data exposed, payment fraud, admin account taken over, production down | Start within 15 minutes, any hour |
| SEV2 | One feature down (payments, sign in, sync), suspicious activity with no confirmed data loss | Start within 1 hour |
| SEV3 | Minor bug, single user issue | Next working day |

## Steps

1. **Detect and declare.** Alarms (CloudWatch, Sentry, WAF, unusual sign in failures, payment errors), a staff report or an outside report to security@ugo.ng. The first person to see it opens an incident channel and names an incident lead.
2. **Start the log.** Write every action with the time (Lagos time) in the incident log. Record when Ugo **became aware** of a possible personal data breach: the 72 hour clock starts then.
3. **Contain.** Use what fits:
   - Revoke sessions: suspend the account in the admin dashboard (signs out everywhere), or for a wider problem rotate `JWT_ACCESS_SECRET` (signs everyone out).
   - Rotate leaked keys in Secrets Manager (Paystack, Flutterwave, Anthropic, Google, CloudFront signing key) and redeploy.
   - Block attackers with a WAF IP set or rule. Tighten rate limits.
   - Raise `minSupportedVersion` if an old app version is being abused.
   - Roll back a bad deploy (ECS keeps the previous task definition; the deployment circuit breaker rolls back failed deploys) or a bad content pack.
4. **Preserve evidence.** Keep logs (CloudWatch, VPC flow logs, WAF logs, audit log table), take a database snapshot, do not delete affected resources.
5. **Assess.** What data, how many people, how many children, which countries, is it encrypted, is it still at risk.
6. **Notify** (the DPO leads, with legal counsel):
   - **Nigeria Data Protection Commission (NDPC)**: within **72 hours** of becoming aware of a personal data breach that is likely to result in a risk to people's rights and freedoms. Include what happened, the data and people affected, likely consequences, what Ugo has done and the DPO's contact details. If some facts are not known yet, notify within 72 hours anyway and send the rest later.
   - **Affected users**: without undue delay where the breach is likely to result in a high risk to them, in clear language, with what they should do. For learners under 18, tell the parent or guardian.
   - **EU users**: if EU residents are affected, notify the relevant EU supervisory authority within 72 hours under GDPR.
   - **Payment partners**: tell Paystack or Flutterwave at once if payment flows are involved. Apple and Google if store accounts or keys are involved.
7. **Fix and recover.** Patch the cause, restore from backup if needed (see the restore steps in MAINTENANCE_PLAN.md), verify, and watch closely for a week.
8. **Review.** Within 10 working days, write a blameless review: timeline, cause, what worked, what to change, owners and dates. Update this plan.

## Outage quick reference

| Symptom | First checks |
| --- | --- |
| API 5xx alarm | ECS service events, recent deploys, RDS health, Sentry errors |
| Slow responses | RDS CPU and connections, ECS CPU (auto scaling), slow query log |
| Sign in codes not arriving | SES sending statistics and suppression list |
| Purchases not unlocking | Payment events page, store notification settings, see PAYMENTS_RUNBOOK.md |
| Content not updating | Pack status in the admin dashboard, CloudFront and S3 access, signed URL keys |
