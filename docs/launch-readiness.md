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

- Structural readiness: 13/13 checks passed.
- Data readiness: false; no profiles or campaigns currently exist.
- Production route sweep: 12 core routes returned HTTP 200.
- Runtime error logs: no errors found in the checked deployment window.
- End-to-end tests with authenticated accounts remain pending.
