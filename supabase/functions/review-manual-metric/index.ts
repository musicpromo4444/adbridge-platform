import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server review service is not configured" }, 503);

  const body = await req.json().catch(() => ({}));
  const metricVerificationId = String(body.metric_verification_id || "");
  const decision = String(body.decision || "");
  const reviewNote = typeof body.review_note === "string" ? body.review_note.trim() : "";

  if (!uuidPattern.test(metricVerificationId)) {
    return json({ error: "A valid metric evidence ID is required" }, 400);
  }
  if (!["approved", "rejected"].includes(decision)) {
    return json({ error: "Choose approved or rejected" }, 400);
  }
  if (reviewNote.length > 500 || (decision === "rejected" && !reviewNote)) {
    return json({ error: "A rejection reason up to 500 characters is required" }, 400);
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await db.auth.getUser(bearer);
  if (authError || !authData.user) return json({ error: "Authentication failed" }, 401);

  const { data: actor, error: actorError } = await db
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (actorError || actor?.role !== "admin") {
    return json({ error: "Administrator access required" }, 403);
  }

  const { data, error } = await db.rpc("admin_review_manual_metric_verification", {
    p_metric_verification_id: metricVerificationId,
    p_decision: decision,
    p_reviewed_by: authData.user.id,
    p_review_note: reviewNote || null,
  });

  if (error || !data?.ok) {
    return json({ error: "The metric review could not be completed. Refresh the queue and try again." }, 409);
  }

  return json({ success: true, ...data });
});
