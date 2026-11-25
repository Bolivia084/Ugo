# Privacy and children

Ugo serves learners from primary school upward, so many users are children. Under the Nigeria Data Protection Act 2023 (NDPA), anyone under 18 is a child. This page lists what the product does and what the company must still do. It is not legal advice: have a Nigerian data protection lawyer review it before launch.

## What the product does

| Requirement | How Ugo meets it |
| --- | --- |
| Parent or guardian consent for learners under 18, before their data is processed | Learners under 18 who sign up alone are held at "waiting for consent" and can do nothing else. Their parent gets an 8 digit code by email and must approve from a verified, MFA protected parent account. Parents can also create child profiles directly, which records consent at the same time. Consent method, version and time are stored in `ParentLink`. |
| Do not rely on a self declared age alone | Consent comes from a separate adult account with a verified email and MFA. The parent account itself is refused for anyone under 18. Counsel should confirm whether stronger checks (for example a small card payment or ID check by the parent) are needed. |
| Collect only what is needed | Name, display name, email, date of birth, study results. No location, contacts, camera, microphone, advertising id or school name. These Android permissions are blocked in the build. |
| No third party advertising or ad tracking | None in the app. iOS privacy manifest declares no tracking. |
| Leaderboards safe for children | Display names only. Off by default for learners under 13, who need a parent to allow them. Anyone can leave at any time. |
| AI tutor safe for children | Answers are fitted to the learner's age band, kept to schoolwork, refuse harmful requests, never ask for personal details; phone numbers and emails are removed before a message leaves Ugo. Conversations are not stored on the server. Parents see how many messages were sent and how many were declined. |
| Delete account and data in the app and on the web | Me, Delete my account (password required). Web deletion endpoint `POST /api/v1/account/delete` for a page on ugo.ng. A parent withdrawing consent deletes the child profile and its data. |
| Privacy policy and terms in the app and on the website | Links in sign up and in Me. The documents themselves must be written and published on ugo.ng. |
| Security of processing | See SECURITY.md. |
| Breach notification | INCIDENT_RESPONSE.md: NDPC within 72 hours of becoming aware, users and parents where required. |

## What the company must do before launch

1. Write and publish the privacy policy, terms of use and children's privacy notice (plain language versions for parents and for learners).
2. Appoint a data protection officer and publish their contact.
3. Confirm with counsel whether Ugo must register with the Nigeria Data Protection Commission as a data controller or processor of major importance, and file if so. Plan for annual compliance audit returns if they apply.
4. Carry out a data protection impact assessment, since Ugo processes children's data at scale.
5. Sign data processing agreements with processors: AWS, Anthropic, Sentry, Expo, Paystack, Flutterwave, email and SMS providers. Record where each one stores data and the legal basis for transfers outside Nigeria.
6. If the app serves users in the EU (likely for SAT and IELTS candidates abroad), apply GDPR too: lawful basis, the age of digital consent in the user's country, an EU representative if required, and data transfer safeguards.
7. Google Play: complete the target audience and content section (including under 13 age groups) and meet the Families policy, including that any SDKs used in the app are allowed for children's apps.
8. App Store: follow the App Review rules for apps used by children, and complete App Privacy details accurately.

## Data map

| Data | Where | Kept for |
| --- | --- | --- |
| Account (name, display name, email, date of birth, role) | PostgreSQL | Until the account is deleted |
| Parent links and consent records | PostgreSQL | Until the link or account is deleted |
| Study attempts, results, custom flashcards, bookmarks | PostgreSQL, and on the phone (encrypted) | Until deleted |
| Plans (store ids, status, dates) | PostgreSQL | Until the account is deleted |
| Payment events (store ids, amounts, status; no card data) | PostgreSQL | Kept after account deletion for tax and refund records (set a retention period with finance and counsel) |
| AI tutor usage counts | PostgreSQL | Until the account is deleted |
| Audit log (who did what, ids only) | PostgreSQL | Set a retention period (for example 2 years) |
| Device push tokens | PostgreSQL | Until sign out, deletion or the token expires |
| Logs and error reports | CloudWatch, Sentry | 90 days in CloudWatch; Sentry per plan settings |
