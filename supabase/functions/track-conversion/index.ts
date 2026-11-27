import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeConversionPayload } from "./campaign-tracking.mjs";

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

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const legacySecret = Deno.env.get("CPA_POSTBACK_SECRET") || "";
  const providedSecret = req.headers.get("x-adbridge-secret") || "";
  if (!providedSecret || providedSecret.length > 256) {
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
  const { data: credential, error: credentialError } = await db.rpc("verify_campaign_postback_secret", {
    p_campaign_id: payload.campaignId,
    p_secret_hash: await sha256Hex(providedSecret),
  });
  let campaignSecretConfigured = false;
  if (credentialError) {
    const migrationNotApplied = credentialError.code === "PGRST202" || credentialError.code === "42883";
    if (!migrationNotApplied) {
      return json({ error: "Campaign postback credential verification is temporarily unavailable." }, 503);
    }
  } else {
    const credentialResult = credential as { configured?: unknown; valid?: unknown } | null;
    campaignSecretConfigured = credentialResult?.configured === true;
    if (campaignSecretConfigured && credentialResult?.valid !== true) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  // Compatibility is limited to campaigns without a campaign-specific secret.
  // Once one is configured, the shared legacy secret is no longer accepted.
  if (!campaignSecretConfigured && (!legacySecret || !constantTimeEqual(providedSecret, legacySecret))) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data, error } = await db.rpc("record_cpa_conversion", {
    p_campaign_id: payload.campaignId,
    p_click_slug: payload.clickId,
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

  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  return json({
    ok: result.ok === true,
    duplicate: result.duplicate === true,
    event_id: typeof result.event_id === "string" ? result.event_id : null,
    paid: result.paid === true,
    amount: Number.isFinite(Number(result.amount)) ? Number(result.amount) : 0,
    conversions: Number.isFinite(Number(result.conversions)) ? Number(result.conversions) : null,
  });
});
