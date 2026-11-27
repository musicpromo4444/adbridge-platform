import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/20261116184500_adbridge_secure_campaign_analytics.sql",
  import.meta.url,
);
const helperPath = new URL("../lib/campaign-analytics.ts", import.meta.url);
const advertiserPath = new URL("../app/advertiser/analytics/page.tsx", import.meta.url);
const creatorPath = new URL("../app/creator/analytics/page.tsx", import.meta.url);

test("campaign analytics RPC is read-only, invoker-secured and authenticated-only", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /select auth\.uid\(\)/i);
  assert.match(sql, /coalesce\(v_actor_role, ''\) not in \('advertiser', 'creator'\)/i);
  assert.match(sql, /revoke all on function public\.get_my_campaign_analytics\(\)\s+from public, anon, authenticated, service_role/i);
  assert.match(sql, /grant execute on function public\.get_my_campaign_analytics\(\)\s+to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+[^;]+\s+on table public\./i);
});

test("analytics aggregates remain scoped to the signed-in account and real ledger states", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /c\.advertiser_id = v_actor_id/i);
  assert.match(sql, /s\.creator_id = v_actor_id/i);
  assert.match(sql, /tl\.creator_id = v_actor_id/i);
  assert.match(sql, /cp\.creator_id = v_actor_id/i);
  assert.match(sql, /e\.status = 'approved'/i);
  assert.match(sql, /cp\.type = 'creator_payment'[\s\S]*cp\.status = 'released'/i);
  assert.match(sql, /s\.last_metric_check_at is not null/i);
  assert.match(sql, /s\.metric_status in \('tracking', 'target_reached'\)/i);
  assert.match(sql, /s\.tracking_error is null/i);
});

test("both analytics pages use the shared RPC and label platform metrics accurately", async () => {
  const [helper, advertiser, creator] = await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(advertiserPath, "utf8"),
    readFile(creatorPath, "utf8"),
  ]);

  assert.match(helper, /rpc\("get_my_campaign_analytics"\)/);
  for (const page of [advertiser, creator]) {
    assert.match(page, /loadMyCampaignAnalytics\(\)/);
    assert.match(page, /Platform-reported views/);
    assert.doesNotMatch(page, /Verified views/);
    assert.doesNotMatch(page, /from\("(campaigns|submissions|tracking_links|campaign_payments|cpa_conversion_events)"\)/);
  }
});
