import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/20261115180000_adbridge_secure_creator_submission_workflow.sql",
  import.meta.url,
);
const pagePath = new URL(
  "../app/creator/submit/submit-client.tsx",
  import.meta.url,
);

test("creator submission and tracked-link creation are atomic and server-owned", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create schema if not exists adbridge_private/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /select auth\.uid\(\)/i);
  assert.match(sql, /p\.role = 'creator'/i);
  assert.match(sql, /from public\.creator_campaigns cc[\s\S]*for update/i);
  assert.match(sql, /coalesce\(v_job_status, ''\) not in \('accepted', 'in_progress', 'changes_requested'\)/i);
  assert.match(sql, /campaign_destination_urls/i);
  assert.match(sql, /insert into public\.submissions/i);
  assert.match(sql, /insert into public\.tracking_links/i);
  assert.match(sql, /update public\.creator_campaigns[\s\S]*set status = 'submitted'/i);
  assert.match(sql, /insert into public\.notifications/i);
  assert.match(sql, /revoke insert, update, delete on table public\.submissions from public, anon, authenticated/i);
  assert.match(sql, /revoke insert, update, delete on table public\.tracking_links from public, anon, authenticated/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /grant execute on function public\.submit_creator_campaign_work[\s\S]*to authenticated/i);
  assert.match(sql, /grant execute on function adbridge_private\.submit_creator_campaign_work[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /insert into public\.campaign_payments/i);
});

test("creator submission UI uses only the authenticated RPC for writes", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /rpc\([\s\S]*"submit_creator_campaign_work"/);
  assert.match(page, /p_job_id: job/);
  assert.match(page, /p_posted_url: posted\.trim\(\)/);
  assert.match(page, /normalizeSocialPostUrl/);
  assert.match(page, /p_posted_url: normalizedPostUrl/);
  assert.match(page, /tracking_slug/);
  assert.match(page, /Evidence \/ Insights link|Proof \/ evidence/i);
  assert.doesNotMatch(page, /p_creator_id\s*:/);
  assert.doesNotMatch(page, /from\("submissions"\)\s*\.insert/);
  assert.doesNotMatch(page, /from\("tracking_links"\)\s*\.insert/);
  assert.doesNotMatch(page, /rpc\("mark_creator_campaign_submitted"/);
});
