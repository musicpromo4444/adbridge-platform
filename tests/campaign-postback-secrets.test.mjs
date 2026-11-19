import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/20261119174500_adbridge_campaign_postback_secrets.sql",
  import.meta.url,
);
const webhookPath = new URL("../supabase/functions/track-conversion/index.ts", import.meta.url);
const managerPath = new URL("../supabase/functions/manage-campaign-postback-secret/index.ts", import.meta.url);
const helperPath = new URL("../lib/campaign-postback.ts", import.meta.url);
const pagePath = new URL("../app/advertiser/campaigns/[id]/postback/page.tsx", import.meta.url);
const campaignsPath = new URL("../app/advertiser/campaigns/page.tsx", import.meta.url);
const configPath = new URL("../supabase/config.toml", import.meta.url);
const workflowPath = new URL("../.github/workflows/build.yml", import.meta.url);

test("campaign postback hashes are isolated in a private RLS-protected store", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create schema if not exists adbridge_private/i);
  assert.match(sql, /create table if not exists adbridge_private\.campaign_postback_secrets/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /grant usage on schema adbridge_private to service_role/i);
  assert.doesNotMatch(sql, /revoke all on schema adbridge_private from public, anon, authenticated/i);
  assert.match(sql, /revoke all on table adbridge_private\.campaign_postback_secrets from public, anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on table adbridge_private\.campaign_postback_secrets to service_role/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /v_actor_role not in \('advertiser', 'admin'\)/i);
  assert.match(sql, /v_advertiser_id is distinct from p_actor_id/i);
  assert.match(sql, /revoke all on function public\.verify_campaign_postback_secret[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.verify_campaign_postback_secret[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant execute on function public\.[^;]+ to authenticated/i);
});

test("secret management authenticates the advertiser and returns plaintext only on rotation", async () => {
  const source = await readFile(managerPath, "utf8");
  assert.match(source, /authClient\.auth\.getUser\(\)/);
  assert.match(source, /from\("profiles"\)/);
  assert.match(source, /advertiser_id/);
  assert.match(source, /crypto\.getRandomValues/);
  assert.match(source, /crypto\.subtle\.digest/);
  assert.match(source, /get_campaign_postback_secret_status/);
  assert.match(source, /rotate_campaign_postback_secret/);
  assert.match(source, /if \(action === "status"\)/);
  assert.match(source, /secret,\s*rotated_at/);
  assert.doesNotMatch(source, /secret_hash\s*:/);
});

test("conversion webhook uses campaign credentials, matches the live click-slug RPC contract and hides creator identity", async () => {
  const source = await readFile(webhookPath, "utf8");
  assert.match(source, /verify_campaign_postback_secret/);
  assert.match(source, /p_click_slug:\s*payload\.clickId/);
  assert.doesNotMatch(source, /p_click_id:/);
  assert.match(source, /!campaignSecretConfigured/);
  assert.match(source, /CPA_POSTBACK_SECRET/);
  assert.doesNotMatch(source, /return json\(data\)/);
  assert.match(source, /event_id:/);
  assert.doesNotMatch(source, /creator_id:\s*result/);
});

test("advertiser conversion setup uses real Edge Function calls and keeps secrets out of browser storage", async () => {
  const [helper, page, campaigns] = await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(pagePath, "utf8"),
    readFile(campaignsPath, "utf8"),
  ]);
  assert.match(helper, /functions\.invoke\("manage-campaign-postback-secret"/);
  assert.match(helper, /action: "status"/);
  assert.match(helper, /action: "rotate"/);
  assert.match(page, /rotateCampaignPostbackSecret\(id\)/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.match(page, /will not show it again/i);
  assert.match(page, /ADBRIDGE_CLICK_ID/);
  assert.match(page, /creator_id/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
  assert.match(campaigns, /\/postback/);
});

test("postback secret manager requires JWT verification and is included in Deno CI", async () => {
  const [config, workflow] = await Promise.all([
    readFile(configPath, "utf8"),
    readFile(workflowPath, "utf8"),
  ]);
  assert.match(config, /\[functions\.manage-campaign-postback-secret\]\s*verify_jwt = true/i);
  assert.match(workflow, /deno check[^\n]*manage-campaign-postback-secret\/index\.ts/);
});
