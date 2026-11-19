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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const bearer = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server credentials are not configured" }, 503);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await db.auth.getUser(bearer);
  if (authError || !authData.user) return json({ error: "Authentication failed" }, 401);

  const body = await req.json().catch(() => ({}));
  const submissionId = String(body.submission_id || "");
  const status = String(body.status || "");
  if (!submissionId || !["approved", "changes_requested"].includes(status)) {
    return json({ error: "submission_id and a valid review status are required" }, 400);
  }

  const { data: submission, error: submissionError } = await db.from("submissions")
    .select("id,campaign_id,creator_id,creator_campaign_id,status,campaigns!inner(advertiser_id,payment_method)")
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionError || !submission) return json({ error: "Submission not found" }, 404);

  const campaign = Array.isArray(submission.campaigns) ? submission.campaigns[0] : submission.campaigns;
  const { data: actor } = await db.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  const isAdmin = actor?.role === "admin";
  if (!isAdmin && campaign?.advertiser_id !== authData.user.id) {
    return json({ error: "You do not own this campaign" }, 403);
  }
  if (submission.status !== "waiting") return json({ error: "This submission is no longer waiting for review" }, 409);

  if (status === "changes_requested") {
    const now = new Date().toISOString();
    const { error: updateError } = await db.from("submissions")
      .update({ status: "changes_requested", reviewed_at: now })
      .eq("id", submissionId).eq("status", "waiting");
    if (updateError) return json({ error: "Could not request changes.", details: updateError.message }, 500);
    if (submission.creator_campaign_id) {
      const { error: jobError } = await db.from("creator_campaigns")
        .update({ status: "changes_requested" }).eq("id", submission.creator_campaign_id);
      if (jobError) return json({ error: "Submission updated, but campaign job status failed.", details: jobError.message }, 500);
    }
    return json({ success: true, status: "changes_requested" });
  }

  if (["cpm", "views", "cpc", "link_traffic", "cpi", "cpa"].includes(String(campaign?.payment_method || "").toLowerCase())) {
    return json({ error: "This payment model requires verified results before payment is released." }, 409);
  }

  const { data: payout, error: payoutError } = await db.rpc(
    "release_manual_submission_payment",
    { p_submission_id: submissionId },
  );
  if (payoutError) return json({ error: payoutError.message }, 409);
  return json({ success: true, status: "approved", payout });
});
