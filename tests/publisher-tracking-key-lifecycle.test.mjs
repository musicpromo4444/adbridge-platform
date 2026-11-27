import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261120005000_adbridge_publisher_tracking_key_lifecycle.sql");
const endpoint = read("../supabase/functions/publisher-tracking-key/index.ts");
const eventReceiver = read("../supabase/functions/track-ad-event/index.ts");
const page = read("../app/publisher/integration/page.tsx");
const docs = read("../docs/publisher-event-signing.md");

test("publisher key audit is private and inaccessible to API roles", () => {
  assert.match(migration, /create table if not exists private\.publisher_tracking_key_audit/i);
  assert.match(migration, /alter table private\.publisher_tracking_key_audit enable row level security/i);
  assert.match(migration, /revoke all on table private\.publisher_tracking_key_audit\s+from public, anon, authenticated, service_role/i);
  assert.match(migration, /action text not null check \(action in \('issued', 'rotated', 'revoked'\)\)/i);
});

test("rotation validates verified ownership and serializes key versions", () => {
  assert.match(migration, /v_property\.publisher_id <> p_actor_id/i);
  assert.match(migration, /v_property\.verified is not true/i);
  assert.match(migration, /p\.role = 'publisher'/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /v_version := coalesce\(v_existing\.key_version, 1\) \+ 1/i);
  assert.match(migration, /revoked_at = null, revoked_by = null/i);
  assert.doesNotMatch(migration, /pg_catalog\.coalesce/i);
});

test("database key lifecycle functions use an empty search path and server-only execution", () => {
  assert.match(migration, /security definer\s+set search_path = ''/i);
  const signatures = [
    "private.rotate_publisher_tracking_key(uuid, uuid, text)",
    "private.revoke_publisher_tracking_key(uuid, uuid)",
    "public.rotate_publisher_tracking_key(uuid, uuid, text)",
    "public.revoke_publisher_tracking_key(uuid, uuid)",
  ];
  for (const signature of signatures) {
    assert.ok(migration.includes("revoke all on function " + signature));
    assert.ok(migration.includes("grant execute on function " + signature));
  }
  assert.doesNotMatch(migration, /grant execute on function (public|private)\.(rotate|revoke)_publisher_tracking_key[^;]*to (anon|authenticated)/i);
});

test("Edge Function authenticates publisher owner before any key action", () => {
  assert.match(endpoint, /auth\.auth\.getUser\(bearer\)/);
  assert.match(endpoint, /profile\?\.role !== "publisher"/);
  assert.match(endpoint, /property\.publisher_id !== actorId/);
  assert.match(endpoint, /\["status", "rotate", "revoke"\]/);
  assert.match(endpoint, /if \(property\.verified !== true\)/);
});

test("status and revoke responses never select or return the signing secret", () => {
  assert.match(endpoint, /select\("key_version,rotated_at,revoked_at"\)/);
  assert.match(endpoint, /db\.rpc\("revoke_publisher_tracking_key"/);
  assert.match(endpoint, /tracking_secret: secret/);
  assert.match(endpoint, /shown_once: true/);
  assert.doesNotMatch(endpoint, /select\("secret_value/);
});

test("event receiver rejects revoked publisher keys", () => {
  assert.match(eventReceiver, /\.is\("revoked_at", null\)/);
});

test("publisher integration UI exposes real status, rotation, and revocation actions", () => {
  assert.match(page, /action: "status"/);
  assert.match(page, /action: "rotate"/);
  assert.match(page, /action: "revoke"/);
  assert.match(page, /Revoke active signing key/);
  assert.match(page, /properties\.map\(p =>/);
  assert.match(page, /!selected\?\.verified/);
  assert.match(page, /keyStatus\?\.active/);
});

test("publisher integration guide documents the lifecycle and one-time secret response", () => {
  assert.match(docs, /"action": "status"/);
  assert.match(docs, /"action": "revoke"/);
  assert.match(docs, /never returns `secret_value`/);
  assert.match(docs, /audit record/i);
});
