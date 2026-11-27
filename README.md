# AdBridge

AdBridge is a performance advertising marketplace connecting advertisers with social creators and website/app publishers. The application is built with Next.js and Supabase.

## Core workflows

- Advertisers create campaigns, upload campaign assets, set a payment model and budget, fund campaigns, and review verified results.
- Creators discover campaigns, complete campaign understanding checks, submit public post links, connect supported social accounts, and manage earnings and withdrawals.
- Website and app publishers register owned inventory, wait for verification, apply for compatible placements, serve approved campaign creatives, and send signed delivery events.
- Admins review users, campaigns, creator submissions, publisher applications, fraud flags, financial reconciliation, withdrawals, platform settings and launch readiness.
- The public rankings show the worldwide top 20 creators/publishers and top 20 advertisers/marketers.
- AdBridge does not provide private advertiser-to-creator chat.

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Production validation:

```bash
npx tsc --noEmit
npm run build
```

## Vercel environment

Set these for production, preview and development:

- `NEXT_PUBLIC_SUPABASE_URL` — AdBridge Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable key.
- `ADBRIDGE_PROXY_SECRET` — private server-to-server secret used by the tracking proxy.

Never place a Supabase service-role key, Paystack secret, social OAuth client secret, or publisher signing secret in a `NEXT_PUBLIC_*` variable or browser code.

## Supabase Edge Function secrets

Configure secrets in the AdBridge Supabase project's Edge Function secrets:

- `PAYSTACK_SECRET_KEY` — Paystack secret key used for checkout initialization, verification and webhook signature validation.
- `APP_URL` — canonical HTTPS application URL used for payment and OAuth callbacks.
- `AI_API_KEY` — server-side key for the configured AI-compatible provider.
- `AI_BASE_URL` — optional AI-compatible API base URL; defaults to the OpenAI API base.
- `AI_MODEL` — optional model name; defaults to `gpt-4o-mini`.
- `CPA_POSTBACK_SECRET` — private secret required for advertiser conversion/install postbacks.
- `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`.
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
- `META_CLIENT_ID`, `META_CLIENT_SECRET`.
- `X_CLIENT_ID`.
- `SNAPCHAT_CLIENT_ID`, `SNAPCHAT_CLIENT_SECRET`.

Supabase supplies its own `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Do not copy service-role credentials into Vercel public environment variables.

## Paystack funding

The campaign funding flow initializes Paystack checkout and verifies the transaction server-side before the database funding ledger is updated.

Configure the Paystack webhook URL shown in **Admin → Launch readiness** in the Paystack dashboard. The endpoint is:

```
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/paystack-webhook
```

The webhook validates Paystack's HMAC-SHA512 signature against the raw request body and confirms only a matching successful NGN funding payment. Test with a Paystack test key before switching to live credentials.

## Measurement and fraud controls

- Raw tracking activity is not automatically a verified result.
- A tracking-link click is not a video view.
- Social post metrics require supported platform authorization and ownership checks.
- Website/app publisher events require approved property inventory and server-side HMAC signatures.
- Event assessments, duplicate controls, rate limits and fraud holds gate payable outcomes.
- Campaign funding and creator/publisher payouts are recorded in the payment ledger.

## Launch checklist

Use **Admin → Launch readiness** to review database structure and the presence of required provider credentials. Then run real end-to-end tests with separate advertiser, creator, publisher and admin accounts.

At minimum, verify:

1. Account registration, email confirmation, login and password recovery.
2. Advertiser campaign creation, asset upload, Paystack checkout and webhook confirmation.
3. Creator campaign acceptance, work submission, review and notification.
4. Social OAuth and verified metric retrieval for each provider enabled in production.
5. Publisher property verification, campaign approval, ad serving and signed event ingestion.
6. Fraud holds, financial reconciliation, withdrawal review and payout records.
7. Public rankings and privacy/terms pages.

Provider credential presence is not proof of a successful provider integration. Complete the manual tests before opening registration to the public.

## Legal

The privacy and terms pages are initial product drafts. Obtain jurisdiction-specific legal review before commercial launch.
