import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isSafeHttpUrl, normalizeClickPayload } from "../_shared/campaign-tracking.mjs";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const payload = normalizeClickPayload(await req.json().catch(() => null));
  if (!payload) return json({ error: "Invalid tracking request." }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Tracking is not configured." }, 503);
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload.visitorKey),
  );
  const visitorHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await db.rpc("record_campaign_click", {
    p_slug: payload.slug,
    p_visitor_hash: visitorHash,
    p_referrer_origin: payload.referrerOrigin,
  });

  if (error) {
    const status = error.code === "P0002" ? 404
      : error.code === "22023" ? 400
      : error.code === "P0001" ? 409
      : 503;
    return json({
      error: status === 404
        ? "Tracking link not found."
        : status === 400
          ? "Invalid tracking request."
          : status === 409
            ? "Campaign target, funding or budget does not allow another paid click."
            : "Tracking is temporarily unavailable.",
    }, status);
  }

  const result = data as { target_url?: unknown; counted?: unknown; unique?: unknown; paid?: unknown } | null;
  if (typeof result?.target_url !== "string" || !isSafeHttpUrl(result.target_url)) {
    return json({ error: "Tracking destination is invalid." }, 502);
  }

  return json({
    target_url: result.target_url,
    counted: Boolean(result.counted),
    unique: Boolean(result.unique),
    paid: Boolean(result.paid),
  });
});
