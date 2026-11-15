import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/20261115060000_adbridge_secure_campaign_test_acknowledgements.sql",
  import.meta.url,
);
const pagePath = new URL(
  "../app/creator/campaigns/[id]/page.tsx",
  import.meta.url,
);

test("campaign acknowledgements are written only by an authenticated creator RPC", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create table if not exists public\.creator_campaign_test_acknowledgements/i);
  assert.match(sql, /references public\.campaign_tests\(id\)/i);
  assert.match(sql, /references auth\.users\(id\)/i);
  assert.match(sql, /unique \(campaign_test_id, creator_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /for select to authenticated[\s\S]*auth\.uid\(\)/i);
  assert.match(sql, /revoke all on table public\.creator_campaign_test_acknowledgements[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /from public\\.creator_campaign_tests legacy[\\s\\S]*where legacy\\.understood is true[\\s\\S]*legacy\\.completed is true/i);
  assert.match(sql, /grant select on table public\.creator_campaign_test_acknowledgements\s+to authenticated/i);
  assert.match(sql, /revoke all on function public\.complete_campaign_test_acknowledgement[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.complete_campaign_test_acknowledgement[\s\S]*to authenticated/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /select auth\.uid\(\)/i);
  assert.match(sql, /p\.role = 'creator'/i);
  assert.match(sql, /ct\.required is true[\s\S]*c\.status = 'active'/i);
  assert.match(sql, /external_resource_opened_self_reported/i);
  assert.match(sql, /on conflict \(campaign_test_id, creator_id\)/i);
  assert.match(sql, /revoke all on table public\.creator_campaign_tests from public, anon, authenticated/i);
});

test("creator campaign page uses the secure RPC and labels external activity as self-reported", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /creator_campaign_test_acknowledgements/);
  assert.match(page, /rpc\("complete_campaign_test_acknowledgement"/);
  assert.match(page, /p_external_resource_opened_self_reported:actionOpened/);
  assert.match(page, /self-reported/i);
  assert.match(page, /Confirm acknowledgement/);
  assert.doesNotMatch(page, /from\("creator_campaign_tests"\)/);
  assert.doesNotMatch(page, /creator_campaign_test_acknowledgements"\)\.insert/);
});
