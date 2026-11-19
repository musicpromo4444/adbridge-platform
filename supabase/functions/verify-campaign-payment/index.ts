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

  const authorization = req.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ error: "Server credentials are not configured" }, 503);

  const auth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await auth.auth.getUser();
  if (authError || !authData.user) return json({ error: "Authentication failed" }, 401);

  const body = await req.json().catch(() => ({}));
  const campaignId = String(body.campaign_id || "");
  const reference = String(body.reference || "").trim();
  if (!campaignId || !reference) return json({ error: "campaign_id and reference are required" }, 400);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: campaign, error: campaignError } = await db.from("campaigns")
    .select("id,max_budget,advertiser_id")
    .eq("id", campaignId)
    .eq("advertiser_id", authData.user.id)
    .maybeSingle();
  if (campaignError || !campaign) return json({ error: "Campaign not found" }, 404);

  // A reference must already be registered as a pending funding payment for
  // this exact campaign. This prevents cross-campaign reference reuse.
  const { data: pending, error: pendingError } = await db.from("campaign_payments")
    .select("id,amount,status,provider")
    .eq("campaign_id", campaignId)
    .eq("type", "funding")
    .eq("provider", "paystack")
    .eq("provider_reference", reference)
    .maybeSingle();
  if (pendingError || !pending) return json({ error: "No matching campaign payment was found for this reference." }, 404);
  if (pending.status === "held") return json({ success: true, duplicate: true, status: "funded", amount: pending.amount });
  if (pending.status !== "pending") return json({ error: "This payment is not awaiting verification." }, 409);

  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
  if (!paystackSecret) return json({ error: "Paystack is not configured." }, 503);
  const response = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: "Bearer " + paystackSecret },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.data?.status !== "success") {
    return json({ error: "Paystack has not confirmed this payment.", details: result }, 400);
  }
  if (String(result?.data?.currency || "").toUpperCase() !== "NGN") {
    return json({ error: "Payment currency does not match the campaign funding currency." }, 400);
  }
  const paidAmount = Number(result.data.amount || 0) / 100;
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) return json({ error: "Paystack returned an invalid payment amount." }, 400);

  const { data: confirmation, error: confirmationError } = await db.rpc("confirm_campaign_funding", {
    p_campaign_id: campaignId,
    p_provider_reference: reference,
    p_paid_amount: paidAmount,
  });
  if (confirmationError) return json({ error: confirmationError.message }, 409);
  return json({ success: true, status: "funded", ...confirmation });
});
