import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isSafeHttpUrl,
  normalizeClickPayload,
  normalizeConversionPayload,
} from "../supabase/functions/_shared/campaign-tracking.mjs";

const migrationPath = new URL(
  "../supabase/migrations/20261114180000_adbridge_secure_click_and_cpa_tracking.sql",
  import.meta.url,
);

test("click payload requires a safe slug and visitor token", () => {
  const valid = normalizeClickPayload({
    slug: "c_1234567890abcdef1234",
    visitor_key: "visitor-token-1234567890",
    referrer_origin: "https://social.example/post?id=4",
  });
  assert.deepEqual(valid, {
    slug: "c_1234567890abcdef1234",
    visitorKey: "visitor-token-1234567890",
    referrerOrigin: "https://social.example",
  });
  assert.equal(normalizeClickPayload({ slug: "../admin", visitor_key: "visitor-token-1234567890" }), null);
  assert.equal(normalizeClickPayload({ slug: "c_123456", visitor_key: "short" }), null);
});

test("conversion postbacks require AdBridge click attribution", () => {
  const valid = normalizeConversionPayload({
    campaign_id: "123e4567-e89b-12d3-a456-426614174000",
    click_id: "c_1234567890abcdef1234",
    external_conversion_id: "order-9841",
    action_type: "purchase",
    value: 12500,
  });
  assert.equal(valid?.clickId, "c_1234567890abcdef1234");
  assert.equal(valid?.value, 12500);
  assert.equal(normalizeConversionPayload({
    campaign_id: "123e4567-e89b-12d3-a456-426614174000",
    external_conversion_id: "order-9841",
    creator_id: "caller-controlled",
  }), null);
  assert.equal(normalizeConversionPayload({
    campaign_id: "123e4567-e89b-12d3-a456-426614174000",
    click_id: "unknown",
    external_conversion_id: "order-9841",
  }), null);
  assert.equal(normalizeConversionPayload({
    campaign_id: "123e4567-e89b-12d3-a456-426614174000",
    click_id: "c_1234567890abcdef1234",
    external_conversion_id: "order-9841",
    value: -1,
  }), null);
});

test("tracking destinations allow only credential-free HTTP(S) URLs", () => {
  assert.equal(isSafeHttpUrl("https://brand.example/offer"), true);
  assert.equal(isSafeHttpUrl("http://brand.example/offer"), true);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,hello"), false);
  assert.equal(isSafeHttpUrl("https://user:pass@brand.example/"), false);
});

test("migration keeps click and ledger writes behind service-role functions", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /campaign_click_visitors enable row level security/i);
  assert.match(sql, /revoke all on table public\.campaign_click_visitors from public, anon, authenticated/i);
  assert.match(sql, /grant all on table public\.campaign_click_visitors to service_role/i);
  assert.match(sql, /last_clicked_at <= v_now - interval '30 seconds'/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /release_creator_campaign_payment/i);
  assert.match(sql, /record_cpa_conversion/i);
  assert.match(sql, /revoke all on function public\.record_cpa_conversion[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.record_cpa_conversion[\s\S]*to service_role/i);
  assert.match(sql, /public\.notifications/i);
});

test("all campaign payout paths use the atomic ledger RPC", async () => {
  const [videoMetrics, review, conversion] = await Promise.all([
    readFile(new URL("../supabase/functions/track-video-metrics/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/review-submission/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/functions/track-conversion/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(videoMetrics, /rpc\("release_creator_campaign_payment"/);
  assert.match(videoMetrics, /auth\.getUser\(token\)/);
  assert.match(review, /rpc\("release_creator_campaign_payment"/);
  assert.match(conversion, /rpc\("record_cpa_conversion"/);
  assert.doesNotMatch(conversion, /\.from\("campaign_payments"\)\.insert/);
});
