import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261119182000_secure_creator_platform_credentials.sql");
const connectionsPage = read("../app/creator/connections/page.tsx");
const oauthFunction = read("../supabase/functions/social-oauth-start/index.ts");
const metricsFunction = read("../supabase/functions/track-video-metrics/index.ts");
const supabaseConfig = read("../supabase/config.toml");

test("browser roles cannot read or write OAuth credential columns", () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE public\.creator_platform_connections\s+FROM public, anon, authenticated/i);
  assert.match(migration, /REVOKE ALL PRIVILEGES\s*\([\s\S]*access_token[\s\S]*refresh_token[\s\S]*\) ON TABLE public\.creator_platform_connections\s+FROM public, anon, authenticated/i);
  assert.match(migration, /GRANT SELECT\s*\(creator_id, platform, connected, expires_at, updated_at\)\s+ON TABLE public\.creator_platform_connections\s+TO authenticated/i);
  assert.doesNotMatch(migration, /GRANT SELECT ON TABLE public\.creator_platform_connections TO (anon|authenticated)/i);
});

test("credentials are copied into a non-API private table with service-role-only table access", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS adbridge_private\.creator_platform_credentials/i);
  assert.match(migration, /ALTER TABLE adbridge_private\.creator_platform_credentials ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE adbridge_private\.creator_platform_credentials\s+TO service_role/i);
  assert.match(migration, /INSERT INTO adbridge_private\.creator_platform_credentials[\s\S]*FROM public\.creator_platform_connections/i);
});

test("only service_role can call the credential reader and writer", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_creator_platform_credentials/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_creator_platform_credentials\(uuid, text\)\s+TO service_role/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.upsert_creator_platform_credentials/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.upsert_creator_platform_credentials\(uuid, text, text, text, text, timestamptz\)\s+TO service_role/i);
});

test("disconnect derives the creator from auth.uid and clears stored credentials", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION adbridge_private\.disconnect_creator_platform/i);
  assert.match(migration, /v_creator_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /p\.role = 'creator'/i);
  assert.match(migration, /DELETE FROM adbridge_private\.creator_platform_credentials/i);
  assert.match(migration, /access_token = null[\s\S]*refresh_token = null/i);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.disconnect_creator_platform/i);
  assert.match(migration, /SECURITY INVOKER/i);
});

test("connections UI reads metadata only and uses the authenticated disconnect RPC", () => {
  assert.match(connectionsPage, /select\("platform,connected,expires_at,updated_at"\)/);
  assert.match(connectionsPage, /rpc\("disconnect_creator_platform"/);
  assert.doesNotMatch(connectionsPage, /\.from\("creator_platform_connections"\)\s*\.update/i);
  assert.doesNotMatch(connectionsPage, /access_token|refresh_token|platform_user_id/i);
});

test("OAuth callback disables edge JWT middleware only because POST validates the user and GET consumes state", () => {
  assert.match(supabaseConfig, /\[functions\.social-oauth-start\][\s\S]*verify_jwt\s*=\s*false/i);
  assert.match(oauthFunction, /auth\.getUser\(token\)/);
  assert.match(oauthFunction, /social_oauth_states/);
  assert.match(oauthFunction, /upsert_creator_platform_credentials/);
  assert.doesNotMatch(oauthFunction, /\.from\("creator_platform_connections"\)\.upsert/i);
});

test("video metrics read credentials through the service-role RPC, not the public table", () => {
  assert.match(metricsFunction, /get_creator_platform_credentials/);
  assert.doesNotMatch(metricsFunction, /\.from\("creator_platform_connections"\)/);
  assert.match(metricsFunction, /item\.snippet\?\.channelId !== connection\.platform_user_id/);
  assert.match(metricsFunction, /data\.data\.author_id !== connection\.platform_user_id/);
  assert.doesNotMatch(metricsFunction, /searchParams\.set\("access_token"/);
  assert.match(metricsFunction, /Authorization: "Bearer " \+ connection\.access_token/);
});
