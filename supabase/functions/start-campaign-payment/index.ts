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
const isPaystackCheckoutUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.paystack.com"
      && !url.username && !url.password;
  } catch {
    return false;
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json({ error: "Authentication required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  const appUrl = Deno.env.get("APP_URL");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Campaign funding is not configured." }, 503);
  if (!paystackSecret || !appUrl) return json({ error: "Paystack campaign funding is not configured." }, 503);

  let appOrigin: string;
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:") throw new Error("HTTPS required.");
    appOrigin = parsed.origin;
  } catch {
    return json({ error: "APP_URL must be a valid HTTPS application URL." }, 503);
  }

  const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
  const campaignId = typeof payload?.campaign_id === "string" ? payload.campaign_id : "";
  if (!uuidPattern.test(campaignId)) return json({ error: "A valid campaign_id is required." }, 400);

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await db.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return json({ error: "Authentication failed." }, 401);
  if (!user.email) return json({ error: "Your account needs an email before campaign funding." }, 400);

  const newReference = "adbridge_" + crypto.randomUUID().replaceAll("-", "");
  const { data: preparedData, error: prepareError } = await db.rpc("prepare_campaign_funding", {
    p_campaign_id: campaignId,
    p_advertiser_id: user.id,
    p_new_reference: newReference,
  });

  if (prepareError) {
    const status = prepareError.code === "42501" ? 403
      : prepareError.code === "P0002" ? 404
      : prepareError.code === "P0001" ? 409
      : prepareError.code === "22023" ? 400
      : 503;
    return json({
      error: status === 403 ? "Advertiser access is required."
        : status === 404 ? "Campaign not found."
        : status === 409 ? "This campaign has a funding attempt that needs attention."
        : status === 400 ? "The campaign budget is invalid."
        : "A secure funding attempt could not be prepared.",
    }, status);
  }

  const prepared = preparedData as {
    already_funded?: unknown;
    payment_id?: unknown;
    reference?: unknown;
    amount?: unknown;
    checkout_url?: unknown;
  } | null;

  if (prepared?.already_funded === true) {
    return json({ error: "This campaign already has its full confirmed budget.", already_funded: true }, 409);
  }

  const paymentId = typeof prepared?.payment_id === "string" ? prepared.payment_id : "";
  const reference = typeof prepared?.reference === "string" ? prepared.reference : "";
  const amount = Number(prepared?.amount);
  if (!uuidPattern.test(paymentId) || !referencePattern.test(reference)
      || !Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) !== amount * 100) {
    return json({ error: "The saved funding attempt is incomplete. Contact AdBridge support." }, 503);
  }

  if (prepared?.checkout_url !== null && prepared?.checkout_url !== undefined) {
    if (!isPaystackCheckoutUrl(prepared.checkout_url)) {
      return json({ error: "The saved Paystack checkout link is invalid. Contact AdBridge support." }, 409);
    }
    return json({ authorization_url: prepared.checkout_url, reference, amount });
  }

  const amountKobo = Math.round(amount * 100);
  const callbackUrl = new URL("/advertiser/fund/verify", appOrigin);
  callbackUrl.searchParams.set("campaign", campaignId);

  let paystackResponse: Response;
  try {
    paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + paystackSecret, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        amount: amountKobo,
        currency: "NGN",
        reference,
        callback_url: callbackUrl.toString(),
        metadata: { campaign_id: campaignId, payment_id: paymentId },
      }),
    });
  } catch {
    // Paystack may have received the request. Keep the pending reference for a safe retry.
    return json({ error: "Checkout initialization could not be confirmed. Retry to resume the same funding attempt." }, 502);
  }

  const providerResult = await paystackResponse.json().catch(() => null) as {
    status?: unknown;
    data?: { authorization_url?: unknown; reference?: unknown; amount?: unknown; currency?: unknown };
  } | null;

  if (!paystackResponse.ok || providerResult?.status !== true) {
    await db.from("campaign_payments").update({ status: "cancelled" })
      .eq("id", paymentId).eq("campaign_id", campaignId)
      .eq("provider_reference", reference).eq("status", "pending");
    return json({ error: "Paystack could not initialize this campaign payment. You can start a new attempt." }, 502);
  }

  const authorizationUrl = providerResult.data?.authorization_url;
  if (!isPaystackCheckoutUrl(authorizationUrl)
      || providerResult.data?.reference !== reference
      || Number(providerResult.data?.amount) !== amountKobo
      || (providerResult.data?.currency && providerResult.data.currency !== "NGN")) {
    return json({ error: "Paystack returned an unexpected checkout response. Contact AdBridge support before retrying." }, 502);
  }

  const { data: attached, error: attachError } = await db.from("campaign_payments")
    .update({ checkout_url: authorizationUrl })
    .eq("id", paymentId).eq("campaign_id", campaignId)
    .eq("provider_reference", reference).eq("status", "pending")
    .select("id").maybeSingle();

  if (attachError || !attached) {
    return json({ error: "The checkout could not be linked to its funding record. Contact AdBridge support before paying." }, 503);
  }

  return json({ authorization_url: authorizationUrl, reference, amount });
});
