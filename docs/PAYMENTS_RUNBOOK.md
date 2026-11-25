# Payments runbook

How plans are paid for, how to handle refunds and failed renewals, and how to reconcile Apple, Google and Paystack with Ugo's records.

## How it works

- Every plan a user holds is one row in the `Entitlement` table: user, exam, source (APPLE, GOOGLE, PAYSTACK, FLUTTERWAVE, PROMO), status, start date, expiry date, auto renew.
- A plan gives access while its status is ACTIVE, GRACE_PERIOD, BILLING_RETRY or CANCELLED (cancelled means "will not renew") and its expiry date has not passed.
- Every store notification and webhook is stored once in `PaymentEvent` (no card data). If the same event arrives twice it is ignored; an event that failed half way is retried.
- Purchases are always checked with the store or gateway on the server before access is given.
- The app keeps a signed copy of the user's plans so paid content works offline, and refreshes it when online.

| Source | How a purchase reaches Ugo | Renewals, cancellations, refunds |
| --- | --- | --- |
| Apple | App sends the StoreKit 2 signed transaction to `/billing/apple/verify` | App Store Server Notifications V2 at `/webhooks/apple` |
| Google | App sends the purchase token to `/billing/google/verify`; the server acknowledges it | Real-time Developer Notifications at `/webhooks/google` |
| Paystack | Website starts checkout through `/billing/web/checkout`; Paystack calls `/webhooks/paystack` | Same webhook (`charge.success`, `subscription.not_renew`, `subscription.disable`, `invoice.payment_failed`, `refund.processed`) |
| Flutterwave | Backup checkout; webhook at `/webhooks/flutterwave` | Same webhook |

## Daily checks (support or finance, 5 minutes)

1. Admin dashboard, Plans, prices and revenue, **Payment events needing attention**. Anything listed failed or was not processed.
2. CloudWatch alarm `payment-errors` should be quiet.

## A user paid but has no access

1. Find the user in **User support** and look at their plans.
2. Ask them to tap **Restore purchases** in the Plans screen (store purchases), with the same store account they paid with.
3. If it still fails, check **Payment events** for their purchase. Common causes:
   - `PURCHASE_OWNED_BY_ANOTHER_ACCOUNT`: the store purchase was made while signed in to a different Ugo account. Ask which account they want; the purchase stays tied to the account that made it. Escalate to an admin if it needs moving.
   - `Unknown product`: the product id in the store does not match the exam's product id in the admin dashboard. Fix the id, then ask the user to restore again.
   - Webhook signature failures: the webhook secret in the gateway dashboard and in the API secret do not match.
4. Never grant access by editing the database by hand. If a payment is confirmed but stuck, an admin can create a one year PROMO code with a single use for that exam and give it to the user, and note the ticket number in the code name.

## Refunds

- **Apple and Google**: users ask the store for refunds (Apple through reportaproblem.apple.com; Google through Play, or support can refund from Play Console within Google's window). When the store refunds, the notification marks the plan REFUNDED and access stops.
- **Paystack**: refund from the Paystack dashboard. The `refund.processed` webhook marks the plan REFUNDED. Record the reason in the support ticket.
- **Flutterwave**: refund from the dashboard, then an admin ends the plan in User support (End plan, with the refund reference as the reason). Flutterwave refunds are not linked automatically yet.

## Failed renewals

- Apple and Google handle retries and grace periods. During grace the plan stays open (GRACE_PERIOD); during retry without grace it shows BILLING_RETRY. When the store gives up, the plan becomes EXPIRED.
- Paystack sends `invoice.payment_failed`: the plan moves to BILLING_RETRY. Paystack retries the card; on success `charge.success` extends the plan by a year from the old expiry date.
- A daily job also expires any plan that is three days past its expiry date with no renewal, as a safety net.

## Price changes

1. Change the store prices in App Store Connect and Play Console. Both stores have their own rules for telling existing subscribers; follow them.
2. In the admin dashboard, schedule the new web price on the exam. It applies to new web purchases and renewals after the notice period (setting `priceChangeNoticeDays`).
3. Update the Paystack and Flutterwave plan amounts on the date the new price applies.

## Monthly reconciliation (finance)

1. Export from each source for the month: App Store Connect Sales and Trends (or financial reports), Google Play earnings report, Paystack transactions export, Flutterwave transactions export.
2. In the admin dashboard, run **Plans, prices and revenue** for the same dates.
3. Compare counts of new plans per exam and source. Web revenue in Ugo should match Paystack and Flutterwave settlements (before their fees). Store revenue is taken from the store reports (Ugo records the plan, not the store's payout after commission).
4. Investigate any difference over 1 percent: look for payment events with errors, refunds not yet received, or purchases that were never verified.
5. File the reconciliation sheet with the month's accounts.
