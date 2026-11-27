import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const advertiser=readFileSync(new URL("../app/advertiser/analytics/page.tsx",import.meta.url),"utf8");
const creator=readFileSync(new URL("../app/creator/analytics/page.tsx",import.meta.url),"utf8");
const freshness=readFileSync(new URL("../lib/advertiser-analytics.ts",import.meta.url),"utf8");

test("advertiser analytics uses aggregate RPCs and separate metric freshness",()=>{
  assert.match(advertiser,/rpc\("get_advertiser_measurement_summary"/);
  assert.match(advertiser,/loadAdvertiserCampaignAnalytics\(supabase\)/);
  assert.match(freshness,/get_my_advertiser_campaign_analytics/);
  assert.match(advertiser,/Platform metric freshness/);
  assert.doesNotMatch(advertiser,/from\("(campaigns|submissions|tracking_links|campaign_payments|cpa_conversion_events)"\)/);
});

test("creator analytics uses a scoped aggregate RPC and distinguishes raw from verified outcomes",()=>{
  assert.match(creator,/get_creator_measurement_summary/);
  assert.match(creator,/Raw click activity/);
  assert.match(creator,/Verified views/);
  assert.doesNotMatch(creator,/from\("(campaigns|submissions|tracking_links|campaign_payments|cpa_conversion_events)"\)/);
});
