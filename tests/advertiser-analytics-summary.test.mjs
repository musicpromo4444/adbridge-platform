import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseAdvertiserCampaignAnalyticsRows } from "../lib/advertiser-analytics.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/20261120175100_adbridge_advertiser_campaign_analytics_summary.sql", import.meta.url),
  "utf8",
);
const sqlTest = readFileSync(new URL("../supabase/tests/advertiser_campaign_analytics_summary.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/advertiser/analytics/page.tsx", import.meta.url), "utf8");
const rpcClient = readFileSync(new URL("../lib/advertiser-analytics.ts", import.meta.url), "utf8");

const validRow = {
  campaign_id: "11111111-1111-4111-8111-111111111111",
  campaign_name: "Launch campaign",
  goal: "awareness",
  platform: "youtube",
  campaign_status: "active",
  payment_method: "cpm",
  payment_rate: "5.25",
  max_budget: "50000.00",
  desired_results: 10000,
  verified_views: "12500",
  verified_submissions: "2",
  tracked_submissions: "3",
  latest_metric_check_at: "2026-11-21T04:30:00.000Z",
  stale_metric_submissions: "1",
  tracking_clicks: "140",
  unique_tracking_clicks: "110",
  approved_conversions: "4",
  confirmed_funding: "25000.50",
};

test("parses safe numeric aggregates and nullable campaign fields", () => {
  const [row] = parseAdvertiserCampaignAnalyticsRows([validRow]);
  assert.equal(row.verified_views, 12500);
  assert.equal(row.tracking_clicks, 140);
  assert.equal(row.unique_tracking_clicks, 110);
  assert.equal(row.approved_conversions, 4);
  assert.equal(row.confirmed_funding, 25000.5);
  assert.equal(row.stale_metric_submissions, 1);
  assert.equal(row.latest_metric_check_at, validRow.latest_metric_check_at);

  const [nullable] = parseAdvertiserCampaignAnalyticsRows([{
    ...validRow,
    platform: null,
    payment_method: null,
    payment_rate: null,
    max_budget: null,
    desired_results: null,
    latest_metric_check_at: null,
  }]);
  assert.equal(nullable.platform, null);
  assert.equal(nullable.payment_rate, null);
  assert.equal(nullable.desired_results, null);
  assert.equal(nullable.latest_metric_check_at, null);
});

test("accepts an empty advertiser campaign list", () => {
  assert.deepEqual(parseAdvertiserCampaignAnalyticsRows([]), []);
});

test("rejects negative, fractional, and unsafe count values", () => {
  for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "9007199254740992"]) {
    assert.throws(
      () => parseAdvertiserCampaignAnalyticsRows([{ ...validRow, verified_views: value }]),
      /invalid verified views count/i,
    );
  }
});

test("rejects invalid campaign ids, timestamps, and money", () => {
  assert.throws(
    () => parseAdvertiserCampaignAnalyticsRows([{ ...validRow, campaign_id: "not-a-uuid" }]),
    /invalid campaign id/i,
  );
  assert.throws(
    () => parseAdvertiserCampaignAnalyticsRows([{ ...validRow, latest_metric_check_at: "yesterday-ish" }]),
    /invalid metric check timestamp/i,
  );
  assert.throws(
    () => parseAdvertiserCampaignAnalyticsRows([{ ...validRow, confirmed_funding: "-1" }]),
    /invalid confirmed funding amount/i,
  );
});

test("uses an authenticated SECURITY INVOKER RPC and narrow conversion column grant", () => {
  assert.match(migration, /grant select \(campaign_id, status\) on public\.cpa_conversion_events to authenticated/i);
  assert.match(migration, /create or replace function public\.get_my_advertiser_campaign_analytics\(\)/i);
  assert.match(migration, /security invoker\s+set search_path = ''/i);
  assert.match(migration, /c\.advertiser_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /profile\.role = 'advertiser'/i);
  assert.match(migration, /revoke all on function public\.get_my_advertiser_campaign_analytics\(\)\s+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_my_advertiser_campaign_analytics\(\)\s+to authenticated/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("returns aggregate-only data and does not expose creator or conversion identifiers", () => {
  assert.doesNotMatch(migration, /creator_id|posted_url|external_conversion_id|raw_data/i);
  assert.match(migration, /approved_conversions bigint/i);
  assert.match(migration, /count\(e\.campaign_id\) as approved_conversions/i);
  assert.match(migration, /e\.status = 'approved'/i);
});

test("aggregates each event family independently to avoid join fan-out", () => {
  const lateralJoins = migration.match(/left join lateral/gi) || [];
  assert.equal(lateralJoins.length, 4);
  assert.match(migration, /from public\.submissions s\s+where s\.campaign_id = c\.id/i);
  assert.match(migration, /from public\.tracking_links t\s+where t\.campaign_id = c\.id/i);
  assert.match(migration, /from public\.cpa_conversion_events e\s+where e\.campaign_id = c\.id/i);
  assert.match(migration, /from public\.campaign_payments p\s+where p\.campaign_id = c\.id/i);
});

test("marks CPM submissions stale when no successful check exists or the check is older than 24 hours", () => {
  assert.match(migration, /s\.metric_status in \('tracking', 'verified'\)/i);
  assert.match(migration, /s\.last_metric_check_at is null/i);
  assert.match(migration, /s\.last_metric_check_at < pg_catalog\.now\(\) - interval '24 hours'/i);
});

test("includes read-only catalog checks for RLS, RPC grants, and sensitive columns", () => {
  assert.match(sqlTest, /not p\.prosecdef/i);
  assert.match(sqlTest, /has_function_privilege\('anon'/i);
  assert.match(sqlTest, /has_column_privilege\('authenticated'.*'creator_id'/i);
  assert.match(sqlTest, /relrowsecurity/i);
  assert.match(sqlTest, /participants read cpa conversion events/i);
});

test("advertiser analytics uses only the secure aggregate RPC and suppresses partial totals", () => {
  assert.match(rpcClient, /client\.rpc\("get_my_advertiser_campaign_analytics"\)/);
  assert.match(page, /loadAdvertiserCampaignAnalytics\(supabase\)/);
  assert.match(page, /No partial totals are being presented as complete/i);
  assert.doesNotMatch(page, /\.from\("(?:campaigns|submissions|tracking_links|cpa_conversion_events|campaign_payments)"\)/);
});
