import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeConversionPayload } from "../_shared/campaign-tracking.mjs";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const secret = Deno.env.get("CPA_POSTBACK_SECRET") || "";
  const providedSecret = req.headers.get("x-adbridge-secret") || "";
  if (!secret || !constantTimeEqual(providedSecret, secret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const payload = normalizeConversionPayload(body);
  if (!payload) {
    return json({
      error: "A valid campaign_id, AdBridge click_id and external_conversion_id are required. Do not send creator_id.",
    }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Conversion tracking is not configured." }, 503);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await db.rpc("record_cpa_conversion", {
    p_campaign_id: payload.campaignId,
    p_click_id: payload.clickId,
    p_external_conversion_id: payload.externalConversionId,
    p_action_type: payload.actionType,
    p_value: payload.value,
  });

  if (error) {
    const status = error.code === "22023" ? 400 : error.code === "P0002" ? 404 : error.code === "P0001" ? 409 : 503;
    return json({
      error: status === 400
        ? "Invalid conversion postback."
        : status === 404
          ? "Campaign or AdBridge click attribution was not found."
          : status === 409
            ? "Campaign target, funding or budget does not allow this conversion."
            : "Conversion tracking is temporarily unavailable.",
    }, status);
  }

  return json(data);
});
