import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../supabase/migrations/20261117173000_adbridge_atomic_campaign_funding_confirmation.sql", import.meta.url);
const startPath = new URL("../supabase/functions/start-campaign-payment/index.ts", import.meta.url);
const verifyPath = new URL("../supabase/functions/verify-campaign-payment/index.ts", import.meta.url);
const helperPath = new URL("../lib/campaign-funding.ts", import.meta.url);
const fundPagePath = new URL("../app/advertiser/fund/fund-client.tsx", import.meta.url);
const verifyPagePath = new URL("../app/advertiser/fund/verify/verify-client.tsx", import.meta.url);
const configPath = new URL("../supabase/config.toml", import.meta.url);
const workflowPath = new URL("../.github/workflows/build.yml", import.meta.url);

test("funding intent is advertiser-scoped, campaign-locked and reuses one pending Paystack attempt", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function adbridge_private\.prepare_campaign_funding/i);
  assert.match(sql, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(sql, /coalesce\(v_actor_role, ''\) <> 'advertiser'/i);
  assert.match(sql, /v_campaign\.advertiser_id is distinct from p_advertiser_id/i);
  assert.match(sql, /from public\.campaigns c[\s\S]*for update/i);
  assert.match(sql, /cp\.status = 'pending'/i);
  assert.match(sql, /v_pending_count > 1/i);
  assert.match(sql, /insert into public\.campaign_payments/i);
});

test("funding confirmation is atomic, exact-amount and idempotent", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function adbridge_private\.confirm_campaign_funding/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /v_payment\.provider_reference is distinct from p_provider_reference/i);
  assert.match(sql, /round\(coalesce\(v_payment\.amount, 0\) \* 100\) <> round\(p_paid_amount \* 100\)/i);
  assert.match(sql, /if v_payment\.status = 'held' then[\s\S]*'already_confirmed', true/i);
  assert.match(sql, /update public\.campaign_payments\s+set status = 'held'/i);
  assert.match(sql, /update public\.campaigns\s+set funded_amount = v_held_funding/i);
  assert.match(sql, /insert into public\.notifications/i);
});

test("funding RPC execution is limited to service_role and no ledger table grants are widened", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /revoke all on function adbridge_private\.prepare_campaign_funding[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function adbridge_private\.prepare_campaign_funding[\s\S]*to service_role/i);
  assert.match(sql, /revoke all on function adbridge_private\.confirm_campaign_funding[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function adbridge_private\.confirm_campaign_funding[\s\S]*to service_role/i);
  assert.match(sql, /language sql\s+security invoker\s+set search_path = ''[\s\S]*adbridge_private\.confirm_campaign_funding/i);
  assert.match(sql, /revoke all on function public\.confirm_campaign_funding[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.confirm_campaign_funding[\s\S]*to service_role/i);
  assert.doesNotMatch(sql, /grant\s+[^;]+\s+on table public\.(campaigns|campaign_payments)/i);
});

test("start function persists a server-owned pending intent before calling Paystack", async () => {
  const start = await readFile(startPath, "utf8");
  assert.match(start, /auth\.getUser\(token\)/);
  assert.match(start, /rpc\("prepare_campaign_funding"/);
  assert.ok(start.indexOf('rpc("prepare_campaign_funding"') < start.indexOf('fetch("https://api.paystack.co/transaction/initialize"'));
  assert.match(start, /checkout_url: authorizationUrl/);
  assert.match(start, /checkout\.paystack\.com/);
  assert.match(start, /prepared\?\.reused !== true/);
  assert.doesNotMatch(start, /edge-runtime\.d\.ts/);
  assert.doesNotMatch(start, /\.from\("campaign_payments"\)\.insert/);
});

test("verification requires the exact saved Paystack reference, NGN currency and kobo amount", async () => {
  const verify = await readFile(verifyPath, "utf8");
  assert.match(verify, /\.eq\("provider_reference", reference\)/);
  assert.match(verify, /\.in\("status", \["pending", "held"\]\)/);
  assert.match(verify, /providerResult\?\.data\?\.reference !== reference/);
  assert.match(verify, /providerResult\?\.data\?\.currency !== "NGN"/);
  assert.match(verify, /paidKobo !== Math\.round\(paymentAmount \* 100\)/);
  assert.match(verify, /rpc\("confirm_campaign_funding"/);
  assert.doesNotMatch(verify, /edge-runtime\.d\.ts/);
  assert.doesNotMatch(verify, /\.from\("campaign_payments"\)\.(insert|update)/);
  assert.doesNotMatch(verify, /\.from\("campaigns"\)\.update/);
});

test("typed frontend only redirects to Paystack and distinguishes payment received from fully funded", async () => {
  const [helper, fundPage, verifyPage] = await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(fundPagePath, "utf8"),
    readFile(verifyPagePath, "utf8"),
  ]);
  assert.match(helper, /start-campaign-payment/);
  assert.match(helper, /verify-campaign-payment/);
  assert.match(helper, /checkout\.paystack\.com/);
  assert.match(fundPage, /startCampaignFunding\(campaignId\)/);
  assert.match(fundPage, /window\.location\.assign\(result\.data\.authorizationUrl\)/);
  assert.match(verifyPage, /verifyCampaignFunding\(campaign, reference\)/);
  assert.match(verifyPage, /result\.data\.funded/);
  assert.match(verifyPage, /remains a draft/i);
});

test("payment Edge Functions require JWTs and are included in Deno CI", async () => {
  const [config, workflow] = await Promise.all([
    readFile(configPath, "utf8"),
    readFile(workflowPath, "utf8"),
  ]);
  assert.match(config, /\[functions\.start-campaign-payment\]\s+verify_jwt = true/);
  assert.match(config, /\[functions\.verify-campaign-payment\]\s+verify_jwt = true/);
  assert.match(workflow, /supabase\/functions\/start-campaign-payment\/index\.ts/);
  assert.match(workflow, /supabase\/functions\/verify-campaign-payment\/index\.ts/);
});
