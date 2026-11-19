import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261119185000_secure_creator_platform_credentials_and_refresh.sql");
const helper = read("../supabase/functions/_shared/platform-token-refresh.ts");
const refreshFunction = read("../supabase/functions/refresh-social-credentials/index.ts");
const metricsFunction = read("../supabase/functions/track-video-metrics/index.ts");
const connectionsPage = read("../app/creator/connections/page.tsx");
const config = read("../supabase/config.toml");

test("refresh claims are serialized with a short database lease and cooldown", () => {
  assert.match(migration, /create or replace function public\.claim_creator_platform_refresh/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /refresh_lease_until = v_now \+ interval '90 seconds'/i);
  assert.match(migration, /last_refresh_attempt_at > v_now - interval '30 seconds'/i);
  assert.match(migration, /grant execute on function public\.claim_creator_platform_refresh\(uuid, text, boolean\)\s+to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.claim_creator_platform_refresh\(uuid, text, boolean\)\s+to authenticated/i);
});

test("only YouTube and TikTok use provider-backed refresh endpoints", () => {
  assert.match(helper, /https:\/\/oauth2\.googleapis\.com\/token/);
  assert.match(helper, /https:\/\/open\.tiktokapis\.com\/v2\/oauth\/token\//);
  assert.match(migration, /v_platform not in \('youtube', 'tiktok'\)/i);
  assert.match(refreshFunction, /platform !== "youtube" && platform !== "tiktok"/);
});

test("TikTok refresh rotation is required and saved before success is returned", () => {
  assert.match(helper, /TikTok rotates refresh tokens/i);
  assert.match(helper, /payload\?\.refresh_token/);
  assert.match(helper, /upsert_creator_platform_credentials/);\n  assert.match(helper, /p_is_refresh: true/);
  assert.match(helper, /tokenRotated/);
  assert.match(helper, /reconnect_required/);
});

test("refresh endpoint derives creator identity from the validated session", () => {
  assert.match(refreshFunction, /auth\.getUser\(token\)/);
  assert.match(refreshFunction, /profile\?\.role !== "creator"/);
  assert.match(refreshFunction, /refreshPlatformCredential\(db, user\.id, platform, true\)/);
  assert.doesNotMatch(refreshFunction, /payload\?\.creator_id/);
  assert.doesNotMatch(refreshFunction, /p_creator_id:\s*payload/);
});

test("tracking automatically attempts refresh shortly before supported tokens expire", () => {
  assert.match(metricsFunction, /refreshPlatformCredential\(db, creatorId, platform, false\)/);
  assert.match(metricsFunction, /expiresAt <= Date\.now\(\) \+ 5 \* 60 \* 1000/);
  assert.match(metricsFunction, /get_creator_platform_credentials/);
  assert.doesNotMatch(metricsFunction, /\.from\("creator_platform_connections"\)/);
});

test("creator UI calls the real refresh function and labels provider support accurately", () => {
  assert.match(connectionsPage, /refresh-social-credentials/);
  assert.match(connectionsPage, /refreshablePlatforms = new Set<PlatformId>\(\["youtube", "tiktok"\]\)/);
  assert.match(connectionsPage, /Refresh access/);
  assert.match(connectionsPage, /Other platforms may require/);
});

test("refresh endpoint returns status metadata only, never OAuth tokens", () => {
  assert.match(refreshFunction, /expires_at: result\.expires_at/);
  assert.doesNotMatch(refreshFunction, /access_token:/);
  assert.doesNotMatch(refreshFunction, /refresh_token:/);
});

test("refresh RPC failures clear the lease and revoked grants require reconnection", () => {
  assert.match(migration, /create or replace function public\.fail_creator_platform_refresh/i);
  assert.match(migration, /connected = case when coalesce\(p_reauth_required, false\) then false/i);
  assert.match(migration, /access_token = case when coalesce\(p_reauth_required, false\) then null/i);
  assert.match(migration, /grant execute on function public\.fail_creator_platform_refresh\(uuid, text, text, boolean\)\s+to service_role/i);
});

test("refresh Edge Function requires JWT while the provider callback validates state itself", () => {
  assert.match(config, /\[functions\.social-oauth-start\][\s\S]*verify_jwt = false/i);
  assert.match(config, /\[functions\.refresh-social-credentials\][\s\S]*verify_jwt = true/i);
});
