import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL(
  "../supabase/migrations/20261114190000_adbridge_secure_creator_verification_workflow.sql",
  import.meta.url,
);

test("creator verification submissions are authenticated, creator-only and platform-scoped", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /p\.role\s*=\s*'creator'/i);
  assert.match(sql, /v_platform\s*=\s*'instagram'[\s\S]*instagram\.com/i);
  assert.match(sql, /v_platform\s*=\s*'tiktok'[\s\S]*tiktok\.com/i);
  assert.match(sql, /v_platform\s*=\s*'youtube'[\s\S]*youtu\.be/i);
  assert.match(sql, /v_platform\s*=\s*'facebook'[\s\S]*facebook\.com/i);
  assert.match(sql, /v_platform\s*=\s*'x'[\s\S]*twitter\.com/i);
  assert.match(sql, /v_platform\s*=\s*'linkedin'[\s\S]*linkedin\.com/i);
  assert.match(sql, /v_platform\s*=\s*'snapchat'[\s\S]*snapchat\.com/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /v_recent_count\s*>=\s*5/i);
});

test("verification table writes are restricted to server-side RPCs", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on table public\.creator_verification_submissions from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.creator_verification_submissions to authenticated/i);
  assert.match(sql, /creators read own verification submissions[\s\S]*for select to authenticated/i);
  assert.match(sql, /admins read creator verification submissions[\s\S]*for select to authenticated/i);
  assert.match(sql, /revoke all on function public\.submit_creator_verification[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.submit_creator_verification[\s\S]*to authenticated/i);
});

test("admin review locks the pending row and atomically updates profile and notification", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const review = sql.slice(sql.indexOf("create or replace function public.review_creator_verification"));
  assert.match(review, /p\.role\s*=\s*'admin'/i);
  assert.match(review, /for update/i);
  assert.match(review, /v_current_status\s*<>\s*'pending'/i);
  assert.match(review, /update public\.creator_verification_submissions/i);
  assert.match(review, /update public\.profiles[\s\S]*set verified = \(v_status = 'approved'\)/i);
  assert.match(review, /insert into public\.notifications/i);
  assert.match(review, /revoke all on function public\.review_creator_verification[\s\S]*from public, anon, authenticated/i);
  assert.match(review, /grant execute on function public\.review_creator_verification[\s\S]*to authenticated/i);
});

test("creator and admin screens use the secure verification RPCs", async () => {
  const [creator, admin] = await Promise.all([
    readFile(new URL("../app/creator/verification/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/verification/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(creator, /\.rpc\("submit_creator_verification"/);
  assert.doesNotMatch(creator, /\.from\("creator_verification_submissions"\)\.insert/);
  assert.match(admin, /\.rpc\("review_creator_verification"/);
  assert.doesNotMatch(admin, /\.from\("creator_verification_submissions"\)\.update/);
  assert.doesNotMatch(admin, /\.from\("profiles"\)\.update/);
  assert.doesNotMatch(admin, /\.from\("notifications"\)\.insert/);
});
