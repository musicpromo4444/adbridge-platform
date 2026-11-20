import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type KeyStatus = {
  has_key: boolean;
  active: boolean;
  key_version: number | null;
  rotated_at: string | null;
  revoked_at: string | null;
  property_verified: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const raw = await req.text();
  if (raw.length > 4096) return json({ error: "Request too large" }, 413);
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Valid JSON object required" }, 400);
  }

  const propertyId = payload.property_id;
  if (!validUuid(propertyId)) return json({ error: "Valid property_id required" }, 400);
  // Omitted action remains a rotate request for compatibility with existing integrations.
  const action = typeof payload.action === "string" ? payload.action.toLowerCase() : "rotate";
  if (!["status", "rotate", "revoke"].includes(action)) {
    return json({ error: "Unsupported key action" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!url || !serviceKey || !anonKey) return json({ error: "Server credentials unavailable" }, 503);
  if (!bearer) return json({ error: "Sign in first" }, 401);

  const auth = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authError } = await auth.auth.getUser(bearer);
  if (authError || !userData.user) return json({ error: "Invalid session" }, 401);

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const actorId = userData.user.id;
  const { data: profile, error: profileError } = await db
    .from("profiles").select("role").eq("id", actorId).maybeSingle();
  if (profileError) return json({ error: "Publisher access could not be checked" }, 503);
  if (profile?.role !== "publisher") return json({ error: "Publisher access is required" }, 403);

  const { data: property, error: propertyError } = await db
    .from("publisher_properties").select("id,publisher_id,verified")
    .eq("id", propertyId).maybeSingle();
  if (propertyError) return json({ error: "Publisher property could not be checked" }, 503);
  if (!property) return json({ error: "Publisher property not found" }, 404);
  if (property.publisher_id !== actorId) return json({ error: "You do not own this publisher property" }, 403);

  if (action === "status") {
    const { data: record, error: statusError } = await db
      .from("publisher_tracking_secrets")
      .select("key_version,rotated_at,revoked_at")
      .eq("property_id", propertyId).eq("publisher_id", actorId).maybeSingle();
    if (statusError) return json({ error: "Signing-key status could not be loaded" }, 503);
    const status: KeyStatus = {
      has_key: !!record,
      active: !!record && !record.revoked_at && property.verified === true,
      key_version: record?.key_version ?? null,
      rotated_at: record?.rotated_at ?? null,
      revoked_at: record?.revoked_at ?? null,
      property_verified: property.verified === true,
    };
    return json({ success: true, status });
  }

  if (action === "revoke") {
    const { data: result, error: revokeError } = await db.rpc("revoke_publisher_tracking_key", {
      p_property_id: propertyId, p_actor_id: actorId,
    });
    if (revokeError) return json({ error: "Signing key could not be revoked" }, 500);
    const status: KeyStatus = {
      has_key: result?.has_key === true,
      active: false,
      key_version: result?.key_version ?? null,
      rotated_at: result?.rotated_at ?? null,
      revoked_at: result?.revoked_at ?? null,
      property_verified: property.verified === true,
    };
    return json({ success: true, status, revoked: result?.revoked === true });
  }

  if (property.verified !== true) {
    return json({ error: "Property must be verified before issuing a tracking key" }, 409);
  }

  const secret = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const { data: result, error: rotateError } = await db.rpc("rotate_publisher_tracking_key", {
    p_property_id: propertyId, p_actor_id: actorId, p_secret_value: secret,
  });
  if (rotateError || !result?.ok) return json({ error: "Could not issue tracking key" }, 500);

  const status: KeyStatus = {
    has_key: true, active: true, key_version: result.key_version,
    rotated_at: result.rotated_at, revoked_at: null, property_verified: true,
  };
  return json({
    success: true, property_id: propertyId, tracking_secret: secret,
    shown_once: true, status,
    signing: "HMAC-SHA256(secret, timestamp + '.' + exact_request_body)",
    headers: ["x-adbridge-timestamp", "x-adbridge-signature"],
    warning: "Store this secret on your server only. Never put it in browser JavaScript or a public mobile app bundle. Rotating or revoking it invalidates the previous key.",
  });
});
