import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/20261116060000_adbridge_secure_creator_campaign_acceptance.sql",
  import.meta.url,
);
const pagePath = new URL("../app/creator/campaigns/[id]/page.tsx", import.meta.url);

test("campaign acceptance is authenticated, serialized, and checked by the database", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /alter table public\.creator_campaigns enable row level security/i);
  assert.match(sql, /revoke insert on table public\.creator_campaigns from public, anon, authenticated/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /select auth\.uid\(\)/i);
  assert.match(sql, /p\.role[\s\S]*'creator'/i);
  assert.match(sql, /from public\.campaigns c[\s\S]*for update/i);
  assert.match(sql, /coalesce\(v_campaign_status, ''\) <> 'active'/i);
  assert.match(sql, /require_creator_verification/i);
  assert.match(sql, /v_creator_verified/i);
  assert.match(sql, /campaign_test_acknowledgements/i);
  assert.match(sql, /on conflict \(campaign_id, creator_id\) do nothing/i);
  assert.match(sql, /insert into public\.notifications/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /grant execute on function public\.accept_creator_campaign[\s\S]*to authenticated/i);
  assert.match(sql, /grant execute on function adbridge_private\.accept_creator_campaign[\s\S]*to authenticated/i);
  assert.match(sql, /A creator accepted one of your campaigns/i);
  assert.doesNotMatch(sql, /insert into public\.(campaign_payments|creator_ledger|wallet_transactions)/i);
});

test("creator campaign page accepts only through the server-owned RPC", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /rpc\("accept_creator_campaign",\s*\{\s*p_campaign_id:\s*campaignId\s*\}\)/);
  assert.match(page, /data\?\.success/);
  assert.match(page, /data\?\.job_id/);
  assert.doesNotMatch(page, /from\("creator_campaigns"\)\s*\.insert/);
  assert.doesNotMatch(page, /getCreatorId/);
  assert.doesNotMatch(page, /p_creator_id\s*:/);
});
