import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-adbridge-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const expectedSecret = Deno.env.get("CPA_POSTBACK_SECRET") || "";
  const suppliedSecret = req.headers.get("x-adbridge-secret") || "";
  let mismatch = suppliedSecret.length ^ expectedSecret.length;
  const maxLength = Math.max(suppliedSecret.length, expectedSecret.length);
  for (let i = 0; i < maxLength; i++) {
    mismatch |= (suppliedSecret.charCodeAt(i) || 0) ^ (expectedSecret.charCodeAt(i) || 0);
  }
  if (!expectedSecret || mismatch !== 0) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Valid JSON body required" }, 400);

  const campaign_id = String(body.campaign_id || "");
  const click_id = String(body.click_id || "");
  const external_conversion_id = String(body.external_conversion_id || "");
  const action_type = String(body.action_type || "conversion").slice(0, 80);
  const value = body.value === undefined ? 0 : Number(body.value);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaign_id)) {
    return json({ error: "campaign_id must be a valid UUID" }, 400);
  }
  if (!/^c_[a-f0-9]{20}$/i.test(click_id)) return json({ error: "A valid AdBridge click_id is required" }, 400);
  if (!external_conversion_id.trim() || external_conversion_id.length > 200) {
    return json({ error: "external_conversion_id is required and must be at most 200 characters" }, 400);
  }
  if (!Number.isFinite(value) || value < 0) return json({ error: "value must be a non-negative number" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Server database credentials are not configured" }, 503);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.rpc("record_cpa_conversion", {
    p_campaign_id: campaign_id,
    p_click_slug: click_id,
    p_external_conversion_id: external_conversion_id.trim(),
    p_action_type: action_type,
    p_value: value,
  });

  if (error) {
    const status = /not found|does not belong|no creator attribution|not configured/i.test(error.message)
      ? 400
      : /target already reached|not accepting conversions/i.test(error.message) ? 409 : 500;
    return json({ error: error.message }, status);
  }
  return json(data);
});
