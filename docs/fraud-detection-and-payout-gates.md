# AdBridge Fraud Detection and Payout Gates

## Event sources assessed

The unified `adbridge_event_assessments` table records risk and evidence for:

- `tracking_clicks`: unique proxy-tracked clicks, visitor/IP velocity and automated user-agent signals.
- `ad_placement_events`: signed publisher impressions, clicks, video views, installs and conversions.
- `submission_metrics`: platform-API view count refreshes and unusual growth rates.
- `cpa_conversion_events`: signed conversion postbacks and conversion velocity.

Every source row is assessed once using the `source_table + source_row_id` uniqueness constraint. IP, visitor and user-agent identifiers are stored as hashes in the assessment record; raw user-agent evidence is not copied into its JSON evidence.

## Risk scoring

The shared `adbridge_score_event` routine returns a score, status, evidence-based verification result and reason codes.

- Low risk: 0–39
- Review: 40–69
- Blocked: 70+

Signals include automation/headless signatures, duplicate events, visitor velocity, IP velocity, viewability, playback evidence, receipts and platform API view growth.

Click velocity defaults:
- 15 or more clicks from one hashed IP in a campaign within 10 minutes: review signal.
- 20 or more events from a visitor across a creator's links within 10 minutes: review signal.
- 60 IP events or 50 visitor events within 10 minutes: critical/blocked.
- Automated browser signatures score 70+ and are blocked.

Viewability evidence for impressions requires render confirmation, at least 50% visible and at least 1 second visible. Video playback events require playback started, at least 2 seconds watched, 2 heartbeats and the page visible. Platform API view counts require a trusted API source; growth-rate anomalies trigger review.

## Payout protection

Payout routines check the event assessment and open fraud holds in addition to their existing campaign/budget/target checks:

- CPC/link-traffic: only a unique click with a low-risk verified assessment, no open/reviewing creator flag and budget room is payable.
- CPM/views: the latest platform metric assessment must be low-risk and verified; any open fraud hold blocks settlement.
- CPA/CPI: the conversion assessment must be low-risk and verified, with no open creator/campaign hold.
- Publisher ad events: the existing settlement trigger requires low-risk verified event assessment and no open fraud hold.

Risk review is a payment hold, not an automatic account ban. Admins can mark a flag reviewing, resolve it or dismiss it. Resolution does not retroactively auto-pay previously held events.

## SQL sanity checks

Use the shared scorer with synthetic JSON (no production event inserts):

```sql
select public.adbridge_score_event(
  'impression','server_ad_sdk_verified',
  '{"server_verified":true,"rendered":true,"viewable_ratio":0.6,"visible_ms":1200}'::jsonb,
  0,0
);
select public.adbridge_score_event(
  'click','server_tracking_proxy_verified',
  '{"server_verified":true,"unique_click":true,"destination_loaded":true,"automation_detected":true}'::jsonb,
  0,0
);
select public.adbridge_score_event(
  'click','server_tracking_proxy_verified',
  '{"server_verified":true,"unique_click":true,"destination_loaded":true}'::jsonb,
  20,15
);
```

The first case should verify as low risk; the second should be blocked for automation; the third should be blocked because multiple velocity signals combine. These tests are deterministic and do not create event rows or payout records.
