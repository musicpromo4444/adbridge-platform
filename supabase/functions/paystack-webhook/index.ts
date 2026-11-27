import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function toHex(bytes: Uint8Array) {
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function signature(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  const secret = Deno.env.get("PAYSTACK_SECRET_KEY") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret || !url || !serviceKey) return json({ error: "Webhook is not configured" }, 503);

  const raw = await request.text();
  if (raw.length > 1_000_000) return json({ error: "Payload too large" }, 413);

  const supplied = (request.headers.get("x-paystack-signature") || "").trim().toLowerCase();
  if (!supplied || !safeEqual(supplied, await signature(secret, raw))) {
    return json({ error: "Invalid webhook signature" }, 401);
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON payload" }, 400);
  }

  if (event.event !== "charge.success") return json({ received: true, ignored: true });
  const data = event.data || {};
  const reference = String(data.reference || "").trim();
  if (!reference || String(data.status || "").toLowerCase() !== "success") {
    return json({ received: true, ignored: true });
  }
  if (String(data.currency || "").toUpperCase() !== "NGN") {
    return json({ received: true, ignored: true, reason: "unsupported_currency" });
  }

  const amount = Number(data.amount) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ received: true, ignored: true, reason: "invalid_amount" });
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: payment, error: paymentError } = await db
    .from("campaign_payments")
    .select("campaign_id,status,provider")
    .eq("provider", "paystack")
    .eq("provider_reference", reference)
    .eq("type", "funding")
    .maybeSingle();

  if (paymentError) return json({ error: "Payment lookup failed" }, 500);
  if (!payment) return json({ received: true, ignored: true, reason: "unknown_reference" });
  if (!["pending", "held"].includes(payment.status)) {
    return json({ received: true, ignored: true, reason: "payment_not_pending" });
  }

  const { data: confirmation, error: confirmationError } = await db.rpc("confirm_campaign_funding", {
    p_campaign_id: payment.campaign_id,
    p_provider_reference: reference,
    p_paid_amount: amount,
  });
  if (confirmationError) {
    // Permanent amount/reference mismatches need human reconciliation, not
    // endless provider retries. Retry only transient database/server failures.
    if (confirmationError.code === "22023" || confirmationError.code === "55000") {
      return json({ received: true, confirmed: false, manual_review: true });
    }
    return json({ error: "Funding confirmation failed" }, 500);
  }

  return json({ received: true, confirmed: true, ...confirmation });
});
