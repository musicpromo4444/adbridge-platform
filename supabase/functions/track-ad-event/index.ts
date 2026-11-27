import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-adbridge-app-id, x-adbridge-timestamp, x-adbridge-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

async function hash(value: string, secret: string) {
  const bytes = new TextEncoder().encode(value + "|" + secret);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function safeNumber(value: unknown, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}
async function hmacSha256(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signed)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function sameHost(origin: string, registered: string) {
  try {
    const a = new URL(origin);
    const b = new URL(registered.includes("://") ? registered : "https://" + registered);
    return a.protocol === "https:" && a.hostname.toLowerCase().replace(/^www\./, "") === b.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return false; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const raw = await req.text();
  if (raw.length > 16_384) return json({ error: "Payload too large" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ error: "Valid JSON required" }, 400); }

  const placementKey = String(body.placement_key || "").trim().slice(0, 200);
  const eventType = String(body.event_type || "").trim().toLowerCase();
  const visitorKey = String(body.visitor_key || "").trim().slice(0, 128);
  const sessionId = body.session_id ? String(body.session_id).slice(0, 128) : null;
  const providedEventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
  if (providedEventId && (providedEventId.length < 8 || providedEventId.length > 128 || /[\u0000-\u0020]/.test(providedEventId))) {
    return json({ error: "event_id must be a unique 8–128 character value without whitespace" }, 400);
  }
  const eventId = providedEventId || crypto.randomUUID();
  if (!placementKey || !["impression", "click", "video_view", "install", "conversion"].includes(eventType) || visitorKey.length < 8) {
    return json({ error: "placement_key, supported event_type and visitor_key (8+ chars) are required" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server tracking credentials are not configured" }, 503);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: placement, error: placementError } = await db.from("ad_placements")
    .select("id,action_url,frequency_cap,campaign_id,publisher_id,publisher_property_id,enabled,starts_at,ends_at")
    .eq("placement_key", placementKey).eq("enabled", true).maybeSingle();
  if (placementError) return json({ error: "Placement lookup failed" }, 500);
  if (!placement) return json({ recorded: false });

  const now = Date.now();
  if (placement.starts_at && new Date(placement.starts_at).getTime() > now) return json({ recorded: false, reason: "not_started" });
  if (placement.ends_at && new Date(placement.ends_at).getTime() < now) return json({ recorded: false, reason: "expired" });
  if (eventType === "click" && !placement.action_url) return json({ recorded: false, reason: "no_click_destination" });

  if (placement.campaign_id) {
    const { data: campaign } = await db.from("campaigns").select("status").eq("id", placement.campaign_id).maybeSingle();
    if (!campaign || !["funded", "active"].includes(campaign.status)) return json({ recorded: false, reason: "campaign_not_active" });
  }

  let signedPublisherEvent = false;
  if (placement.publisher_property_id) {
    const { data: property } = await db.from("publisher_properties")
      .select("publisher_id,property_type,url,verified")
      .eq("id", placement.publisher_property_id).maybeSingle();
    if (!property || !property.verified || property.publisher_id !== placement.publisher_id) {
      return json({ error: "Publisher property is not verified for this placement" }, 403);
    }

    const timestamp = req.headers.get("x-adbridge-timestamp") || "";
    const suppliedSignature = (req.headers.get("x-adbridge-signature") || "").replace(/^sha256=/i, "").toLowerCase();
    if (timestamp || suppliedSignature) {
      const seconds = Number(timestamp);
      if (!Number.isFinite(seconds) || Math.abs(Date.now() - seconds * 1000) > 300_000) {
        return json({ error: "Signed publisher event timestamp is missing or expired" }, 401);
      }
      const { data: signingKey } = await db.from("publisher_tracking_secrets")
        .select("secret_value").eq("property_id", placement.publisher_property_id)
        .eq("publisher_id", placement.publisher_id).is("revoked_at", null).maybeSingle();
      if (!signingKey?.secret_value) return json({ error: "Publisher server signing key is not active" }, 401);
      const expected = await hmacSha256(String(signingKey.secret_value), timestamp + "." + raw);
      if (!constantTimeEqual(suppliedSignature, expected)) return json({ error: "Invalid publisher event signature" }, 401);
      signedPublisherEvent = true;
      // A signed request without a publisher-generated ID can be replayed with a
      // fresh server-generated UUID on every retry. Require the signed ID so the
      // database's unique event_id index makes retries idempotent.
      if (!providedEventId) return json({ error: "Signed publisher events require a unique event_id for replay protection" }, 400);
    }

    if (["website", "web_app"].includes(property.property_type)) {
      const origin = req.headers.get("origin") || req.headers.get("referer") || "";
      if ((!origin && !signedPublisherEvent) || (origin && (!property.url || !sameHost(origin, property.url)))) {
        return json({ error: "Publisher origin does not match the verified website" }, 403);
      }
    } else {
      const appId = (req.headers.get("x-adbridge-app-id") || "").trim().toLowerCase();
      const registeredId = String(property.url || "").trim().toLowerCase();
      if (!appId || !registeredId || appId !== registeredId) return json({ error: "App identifier does not match the verified publisher property" }, 403);
    }
  }

  const forwarded = req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const userAgent = req.headers.get("user-agent") || "";
  const [ipHash, userAgentHash] = await Promise.all([hash(forwarded, serviceKey), hash(userAgent, serviceKey)]);
  const sinceRateLimit = new Date(now - 600_000).toISOString();
  const { count: ipEventCount } = await db.from("ad_placement_events").select("id", { count: "exact", head: true })
    .eq("placement_id", placement.id).eq("ip_hash", ipHash).gte("occurred_at", sinceRateLimit);
  if (Number(ipEventCount || 0) >= 60) return json({ recorded: false, rate_limited: true }, 429);

  if (eventType === "impression" && Number(placement.frequency_cap || 0) > 0) {
    const since = new Date(now - 86_400_000).toISOString();
    const { count } = await db.from("ad_placement_events").select("id", { count: "exact", head: true })
      .eq("placement_id", placement.id).eq("event_type", "impression")
      .eq("visitor_key", visitorKey).gte("occurred_at", since);
    if (Number(count || 0) >= Number(placement.frequency_cap)) return json({ recorded: false, capped: true });
  }

  const country = req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry") || null;
  // All browser/app telemetry is explicitly untrusted. Only server-side provider
  // integrations may set server_verified=true after independently verifying evidence.
  const metadata = {
    server_verified: signedPublisherEvent,
    automation_detected: /(bot|crawler|spider|headless|phantom|selenium|playwright|puppeteer)/i.test(userAgent),
    rendered: body.rendered === true,
    viewable_ratio: safeNumber(body.viewable_ratio, 1),
    visible_ms: safeNumber(body.visible_ms, 86_400_000),
    destination_loaded: body.destination_loaded === true,
    playback_started: body.playback_started === true,
    watch_seconds: safeNumber(body.watch_seconds, 86_400),
    heartbeat_count: Math.floor(safeNumber(body.heartbeat_count, 100_000)),
    page_visible: body.page_visible === true,
    receipt_id: body.receipt_id ? String(body.receipt_id).slice(0, 200) : null,
  };

  const { error } = await db.from("ad_placement_events").insert({
    placement_id: placement.id,
    event_id: eventId,
    event_type: eventType,
    visitor_key: visitorKey,
    session_id: sessionId,
    country,
    campaign_id: placement.campaign_id,
    publisher_id: placement.publisher_id,
    ip_hash: ipHash,
    user_agent_hash: userAgentHash,
    metadata,
  });
  if (error?.code === "23505") return json({ recorded: false, duplicate: true }, 200);
  if (error) return json({ error: "Could not record ad event" }, 500);
  return json({ recorded: true, event_id: eventId });
});
