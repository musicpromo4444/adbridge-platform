import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) return json({ error: "Authentication failed" }, 401);

  const body = await req.json().catch(() => ({}));
  const submissionId = body?.submission_id;
  const status = body?.status;
  if (!submissionId || !["approved", "changes_requested"].includes(status)) {
    return json({ error: "submission_id and a valid review status are required" }, 400);
  }

  const { data: submission, error: submissionError } = await db
    .from("submissions")
    .select("id,campaign_id,creator_id,creator_campaign_id,status,campaigns!inner(advertiser_id,payment_method,payment_rate,max_budget,status)")
    .eq("id", submissionId)
    .single();

  if (submissionError || !submission) return json({ error: "Submission not found" }, 404);
  const campaign = Array.isArray(submission.campaigns) ? submission.campaigns[0] : submission.campaigns;
  if (!campaign) return json({ error: "Campaign not found" }, 404);

  const { data: actor } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = actor?.role === "admin";
  if (!isAdmin && campaign.advertiser_id !== user.id) {
    return json({ error: "You do not own this campaign" }, 403);
  }
  if (submission.status !== "waiting") {
    return json({ error: "This submission is no longer waiting for review" }, 409);
  }

  if (status === "changes_requested") {
    const { error: updateError } = await db
      .from("submissions")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", submissionId)
      .eq("status", "waiting");
    if (updateError) return json({ error: "The submission status could not be updated." }, 503);

    if (submission.creator_campaign_id) {
      const { error: jobError } = await db
        .from("creator_campaigns")
        .update({ status })
        .eq("id", submission.creator_campaign_id);
      if (jobError) return json({ error: "The creator campaign status could not be updated." }, 503);
    }

    const { error: notificationError } = await db.from("notifications").insert({
      user_id: submission.creator_id,
      title: "Changes requested on your campaign submission",
      body: "AdBridge has requested an update to your submitted work. Open My Work to review the status.",
      kind: "campaign_review",
      link: "/creator/work",
    });
    return json({ success: true, status, notification_sent: !notificationError });
  }

  if (["cpm", "views", "cpc", "clicks", "link_traffic", "cpi", "cpa", "actions"].includes(String(campaign.payment_method).toLowerCase())) {
    return json({ error: "This payment model requires tracked results before payment is released." }, 409);
  }

  const { data: payment, error: paymentError } = await db.rpc("release_creator_campaign_payment", {
    p_campaign_id: submission.campaign_id,
    p_creator_id: submission.creator_id,
    p_amount: Number(campaign.payment_rate || 0),
    p_submission_id: submission.id,
    p_allow_partial: true,
    p_complete_submission: true,
  });

  if (paymentError) return json({ error: "The creator payment could not be safely released." }, 503);
  if (!payment?.paid) return json({ error: "Campaign funding or remaining budget is unavailable." }, 409);

  return json({
    success: true,
    status: "approved",
    payment_amount: Number(payment.amount || 0),
    duplicate_payment: Boolean(payment.duplicate),
  });
});
