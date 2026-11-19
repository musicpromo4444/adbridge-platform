import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const authorization = req.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "Sign in to manage this campaign's postback credential." }, 401);

  const body = await req.json().catch(() => null);
  const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id.trim() : "";
  const action = body?.action;
  if (!uuidPattern.test(campaignId) || !["status", "rotate"].includes(action)) {
    return json({ error: "A valid campaign_id and action are required." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Campaign postback credential management is not configured." }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return json({ error: "Your session is invalid or expired." }, 401);

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [{ data: campaign, error: campaignError }, { data: profile, error: profileError }] = await Promise.all([
    db.from("campaigns")
      .select("id,advertiser_id,payment_method,status")
      .eq("id", campaignId)
      .maybeSingle(),
    db.from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (campaignError || profileError) return json({ error: "Campaign access could not be checked." }, 503);
  if (!campaign || !profile) return json({ error: "Campaign not found." }, 404);

  const role = String(profile.role || "");
  if (!["advertiser", "admin"].includes(role)) {
    return json({ error: "Advertiser access is required." }, 403);
  }
  if (role !== "admin" && campaign.advertiser_id !== user.id) {
    return json({ error: "You cannot manage this campaign." }, 403);
  }
  if (!["cpa", "cpi", "actions"].includes(String(campaign.payment_method || "").toLowerCase())) {
    return json({ error: "This campaign does not use CPA/CPI conversion postbacks." }, 409);
  }

  if (action === "status") {
    const { data, error } = await db.rpc("get_campaign_postback_secret_status", {
      p_campaign_id: campaignId,
      p_actor_id: user.id,
    });
    if (error) return json({ error: "Postback credential status is unavailable. Apply the campaign postback migration first." }, 503);

    const result = data as { configured?: unknown; rotated_at?: unknown; last_used_at?: unknown } | null;
    return json({
      success: true,
      configured: result?.configured === true,
      rotated_at: typeof result?.rotated_at === "string" ? result.rotated_at : null,
      last_used_at: typeof result?.last_used_at === "string" ? result.last_used_at : null,
    });
  }

  const random = crypto.getRandomValues(new Uint8Array(32));
  const secret = "abp_" + base64Url(random);
  const secretHash = await sha256Hex(secret);
  const { data, error } = await db.rpc("rotate_campaign_postback_secret", {
    p_campaign_id: campaignId,
    p_actor_id: user.id,
    p_secret_hash: secretHash,
  });
  if (error) return json({ error: "The campaign postback credential could not be rotated." }, 503);

  const result = data as { rotated_at?: unknown } | null;
  return json({
    success: true,
    configured: true,
    secret,
    rotated_at: typeof result?.rotated_at === "string" ? result.rotated_at : null,
    last_used_at: null,
  });
});
