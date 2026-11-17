import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const referencePattern = /^adbridge_[0-9a-f]{32}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Campaign funding is not configured." }, 503);

  const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
  const campaignId = typeof payload?.campaign_id === "string" ? payload.campaign_id : "";
  const reference = typeof payload?.reference === "string" ? payload.reference : "";
  if (!uuidPattern.test(campaignId) || !referencePattern.test(reference)) {
    return json({ error: "Valid campaign and payment references are required." }, 400);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await db.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return json({ error: "Authentication failed." }, 401);

  const { data: campaign, error: campaignError } = await db.from("campaigns")
    .select("id").eq("id", campaignId).eq("advertiser_id", user.id).maybeSingle();
  if (campaignError || !campaign) return json({ error: "Campaign not found." }, 404);

  const { data: payment, error: paymentError } = await db.from("campaign_payments")
    .select("id,amount,status,provider_reference")
    .eq("campaign_id", campaignId).eq("type", "funding")
    .eq("provider", "paystack").eq("provider_reference", reference)
    .in("status", ["pending", "held"]).maybeSingle();

  if (paymentError || !payment) {
    return json({ error: "No matching pending campaign payment was found." }, paymentError ? 503 : 404);
  }

  const paymentAmount = Number(payment.amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0
      || Math.round(paymentAmount * 100) !== paymentAmount * 100) {
    return json({ error: "The saved campaign payment amount is invalid. Contact AdBridge support." }, 409);
  }

  let paidAmount = paymentAmount;
  let currency = "NGN";

  if (payment.status !== "held") {
    const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackSecret) return json({ error: "Paystack verification is not configured." }, 503);

    let providerResponse: Response;
    try {
      providerResponse = await fetch(
        "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
        { headers: { Authorization: "Bearer " + paystackSecret } },
      );
    } catch {
      return json({ error: "Paystack could not be reached. No funding status was changed." }, 502);
    }

    const providerResult = await providerResponse.json().catch(() => null) as {
      status?: unknown;
      data?: { status?: unknown; reference?: unknown; amount?: unknown; currency?: unknown };
    } | null;

    const paidKobo = Number(providerResult?.data?.amount);
    if (!providerResponse.ok
        || providerResult?.status !== true
        || providerResult?.data?.status !== "success"
        || providerResult?.data?.reference !== reference
        || providerResult?.data?.currency !== "NGN"
        || !Number.isSafeInteger(paidKobo)
        || paidKobo !== Math.round(paymentAmount * 100)) {
      return json({ error: "Paystack has not confirmed the exact NGN amount for this saved campaign payment. No funding status was changed." }, 409);
    }

    paidAmount = paidKobo / 100;
    currency = String(providerResult.data.currency);
  }

  const { data: confirmation, error: confirmationError } = await db.rpc("confirm_campaign_funding", {
    p_campaign_id: campaignId,
    p_payment_id: payment.id,
    p_advertiser_id: user.id,
    p_provider_reference: reference,
    p_paid_amount: paidAmount,
    p_currency: currency,
  });

  if (confirmationError) {
    const status = confirmationError.code === "42501" ? 403
      : confirmationError.code === "P0002" ? 404
      : confirmationError.code === "P0001" ? 409
      : confirmationError.code === "22023" ? 400
      : 503;
    return json({
      error: status === 403 ? "Advertiser access is required."
        : status === 404 ? "The matching campaign funding attempt was not found."
        : status === 409 ? "The verified payment could not be applied to the current campaign budget. Contact AdBridge support."
        : status === 400 ? "The verified payment details are invalid."
        : "Payment confirmation could not be recorded. Contact AdBridge support if your account was charged.",
    }, status);
  }

  const result = confirmation as {
    success?: unknown;
    already_confirmed?: unknown;
    funded?: unknown;
    status?: unknown;
    amount?: unknown;
    held_funding?: unknown;
    remaining_to_fund?: unknown;
  } | null;

  if (result?.success !== true || typeof result.funded !== "boolean") {
    return json({ error: "The funding engine returned an incomplete confirmation. Contact AdBridge support." }, 503);
  }

  return json({
    success: true,
    already_confirmed: result.already_confirmed === true,
    funded: result.funded,
    status: typeof result.status === "string" ? result.status : "draft",
    amount: Number(result.amount),
    held_funding: Number(result.held_funding),
    remaining_to_fund: Number(result.remaining_to_fund),
  });
});
