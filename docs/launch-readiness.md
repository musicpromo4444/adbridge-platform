# AdBridge Launch Readiness

## Structural readiness

The admin launch-readiness RPC checks the core database tables, publisher inventory, verification/notification tables, unified fraud assessments, RLS, event-assessment triggers, payout-gate functions, measurement RPCs, global rankings, creator verification review, notification triggers, Supabase Realtime publication and social disconnect RPC.

## Current test limits

The current database has no user profiles, campaigns, publisher properties, verification requests, notifications, fraud flags or assessed events. Structural checks pass, but signed-in end-to-end scenarios cannot be run without test users and a test campaign.

## Required manual environment checks

- Paystack live credentials, payment callback and redirect URLs.
- Social OAuth provider keys and callback URLs.
- Signed-in advertiser and creator test accounts.
- Campaign funding and payment verification.
- Creator submission and admin approval/rejection notifications.
- Publisher ownership verification, application, approval and server-side ad serving.
- HMAC-signed publisher events; unsigned events remain unverified.
- Social platform metric refresh.
- Conversion/install postback and fraud/payout hold.
- Withdrawal review and payment notification.
- Public ranking behavior after verified events and confirmed funding.

Do not consider launch-ready solely from structural checks. The admin Launch Readiness page distinguishes schema/system checks from data readiness and manual environment tests.

## Latest production validation

- Structural readiness: 18/18 schema/function/trigger checks verified directly against live Supabase after backend synchronization.
- Data readiness: false; no profiles or campaigns currently exist.
- Live Supabase migration history now includes the synchronized publisher delivery, fraud hardening, measurement, notification, creator submission, financial reconciliation, earnings/withdrawal, ranking and payout-readiness migrations.
- Permission hardening applied: public/anonymous direct execution removed from guarded admin/measurement/social RPCs and trigger-only functions; global ranking remains intentionally public.
- Production route sweep: 12 core routes returned HTTP 200.
- Runtime error logs: no errors found in the checked deployment window.\n- Latest source validation in an isolated Vercel sandbox: TypeScript passed, Next.js production build succeeded, 54/54 routes generated, and `npm audit` reports 0 vulnerabilities with Next.js 16.4.6.\n- Production deployment of this newer source is blocked by the Vercel daily deployment API quota (100/day); CLI is unavailable in the sandbox.
- End-to-end tests with authenticated accounts remain pending.
