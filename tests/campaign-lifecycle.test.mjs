import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/20261116182500_adbridge_secure_campaign_lifecycle.sql",
  import.meta.url,
);
const helperPath = new URL("../lib/campaign-lifecycle.ts", import.meta.url);
const advertiserPath = new URL("../app/advertiser/campaigns/page.tsx", import.meta.url);
const adminPath = new URL("../app/admin/campaigns/page.tsx", import.meta.url);

test("campaign lifecycle transitions are role-checked, serialized and funding-aware", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /revoke update on table public\.campaigns from public, anon, authenticated/i);
  assert.match(sql, /revoke update \(status\) on table public\.campaigns from public, anon, authenticated/i);
  assert.match(sql, /grant update \([\s\S]*name,[\s\S]*max_budget,[\s\S]*updated_at[\s\S]*\) on table public\.campaigns to authenticated/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /select auth\.uid\(\)/i);
  assert.match(sql, /coalesce\(v_actor_role, ''\) not in \('advertiser', 'admin'\)/i);
  assert.match(sql, /where c\.id = p_campaign_id[\s\S]*for update/i);
  assert.match(sql, /v_actor_role <> 'admin' and v_advertiser_id is distinct from v_actor_id/i);
  assert.match(sql, /v_target_status not in \('active', 'paused', 'closed'\)/i);
  assert.match(sql, /v_current_status = 'closed'/i);
  assert.match(sql, /cp\.type = 'funding'[\s\S]*cp\.status = 'held'/i);
  assert.match(sql, /cp\.type = 'creator_payment'[\s\S]*cp\.status in \('released', 'approved', 'pending'\)/i);
  assert.match(sql, /v_available_budget <= 0/i);
  assert.match(sql, /insert into public\.notifications/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /grant execute on function public\.transition_campaign_status\(uuid, text\)[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /creator_id[^\n]*notification|notification[^\n]*creator_id/i);
});

test("advertiser and admin dashboards use the shared lifecycle RPC, not direct status writes", async () => {
  const [helper, advertiser, admin] = await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(advertiserPath, "utf8"),
    readFile(adminPath, "utf8"),
  ]);

  assert.match(helper, /rpc\("transition_campaign_status"/);
  assert.match(helper, /p_campaign_id: campaignId/);
  assert.match(helper, /p_target_status: targetStatus/);
  assert.match(advertiser, /transitionCampaignStatus\(id,\s*status\)/);
  assert.match(admin, /transitionCampaignStatus\(selected\.id,\s*status\)/);
  assert.doesNotMatch(advertiser, /from\("campaigns"\)\.update\(\{status/);
  assert.doesNotMatch(admin, /from\("campaigns"\)\.update\(\{status/);
});
