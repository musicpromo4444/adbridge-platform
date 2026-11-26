# Verified Measurement System

## Summary RPCs

- `get_campaign_measurement_summary(campaign_id)`: advertiser/admin-only aggregate for a single owned campaign.
- `get_advertiser_measurement_summary()`: advertiser/admin-only list of campaign aggregates.
- `get_creator_measurement_summary()`: creator/publisher-only summary for the signed-in account.

These functions are security-definer and enforce ownership/role checks internally. They return aggregate counts and money totals, not raw visitor hashes, IP hashes, creator identities, or event-level data.

## Measurement groups

- Creator social post metrics: cumulative platform-API views; deduplicated by external video ID and counted only while the submission is marked verified.
- Tracking-link clicks: raw and unique link totals, verified low-risk clicks, review and blocked click counts.
- Conversion postbacks: raw approved postbacks and verified/review/blocked counts.
- Website/app publisher events: raw and verified impressions, video views, clicks, installs and conversions.
- Funding and payouts: confirmed funding, released payouts and held payouts.
- Health: metric checks, metric review counts, open fraud flags and last platform refresh.

## Dashboard behavior

Advertiser campaign results and analytics use the campaign measurement RPCs. Creator analytics uses the creator measurement RPC. Raw and verified totals are separated. Verified views are deduplicated by external video ID so repeated submissions of the same post do not inflate view totals. Publisher event metrics remain separate from social post views.

Tracking-link clicks never add to video views. Event assessments with review/blocked risk status are not displayed as verified or payable. Budget and payout totals remain separate from delivery metrics.

## Validation notes

- Next.js build and TypeScript passed for the measurement UI.
- Preview routes for advertiser results, advertiser analytics, creator analytics and advertiser delivery returned HTTP 200.
- Dynamic authenticated data/RPC execution still requires a signed-in test advertiser and creator account; the deployment check cannot validate private account data without that session.
