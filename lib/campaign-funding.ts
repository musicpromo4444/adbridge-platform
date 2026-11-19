import { supabase } from "@/lib/supabase";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const referencePattern = /^adbridge_[0-9a-f]{32}$/;

export type CampaignFundingCheckout = {
  authorizationUrl: string;
  reference: string;
  amount: number;
};

export type CampaignFundingConfirmation = {
  alreadyConfirmed: boolean;
  funded: boolean;
  status: string;
  amount: number;
  heldFunding: number;
  remainingToFund: number;
};

type Outcome<T> = { data: T | null; error: Error | null };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function positiveAmount(value: unknown): number | null {
  const amount = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function nonNegativeAmount(value: unknown): number | null {
  const amount = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function responseError(payload: Record<string, unknown> | null, fallback: string, error?: Error | null) {
  return new Error(
    typeof payload?.error === "string" && payload.error.trim()
      ? payload.error
      : error?.message || fallback,
  );
}

export async function startCampaignFunding(campaignId: string): Promise<Outcome<CampaignFundingCheckout>> {
  if (!supabase) return { data: null, error: new Error("AdBridge database connection is unavailable.") };
  if (!uuidPattern.test(campaignId)) return { data: null, error: new Error("A valid campaign is required.") };

  const { data, error } = await supabase.functions.invoke<unknown>("start-campaign-payment", {
    body: { campaign_id: campaignId },
  });
  const payload = asRecord(data);
  if (error || !payload) {
    return { data: null, error: responseError(payload, "Campaign checkout could not be started.", error) };
  }

  const reference = typeof payload.reference === "string" ? payload.reference : "";
  const amount = positiveAmount(payload.amount);
  let authorizationUrl = "";
  try {
    const parsed = new URL(typeof payload.authorization_url === "string" ? payload.authorization_url : "");
    if (parsed.protocol === "https:" && parsed.hostname === "checkout.paystack.com"
        && !parsed.username && !parsed.password) authorizationUrl = parsed.toString();
  } catch {
    authorizationUrl = "";
  }

  if (!referencePattern.test(reference) || amount === null || !authorizationUrl) {
    return { data: null, error: responseError(payload, "Paystack returned an invalid checkout response.") };
  }
  return { data: { authorizationUrl, reference, amount }, error: null };
}

export async function verifyCampaignFunding(
  campaignId: string,
  reference: string,
): Promise<Outcome<CampaignFundingConfirmation>> {
  if (!supabase) return { data: null, error: new Error("AdBridge database connection is unavailable.") };
  if (!uuidPattern.test(campaignId) || !referencePattern.test(reference)) {
    return { data: null, error: new Error("Valid campaign and payment references are required.") };
  }

  const { data, error } = await supabase.functions.invoke<unknown>("verify-campaign-payment", {
    body: { campaign_id: campaignId, reference },
  });
  const payload = asRecord(data);
  if (error || !payload || payload.success !== true || typeof payload.funded !== "boolean") {
    return { data: null, error: responseError(payload, "Payment confirmation could not be verified.", error) };
  }

  const status = typeof payload.status === "string" ? payload.status : "";
  const amount = positiveAmount(payload.amount);
  const heldFunding = nonNegativeAmount(payload.held_funding);
  const remainingToFund = nonNegativeAmount(payload.remaining_to_fund);
  if (!status || amount === null || heldFunding === null || remainingToFund === null) {
    return { data: null, error: new Error("AdBridge returned an incomplete funding confirmation.") };
  }

  return {
    data: {
      alreadyConfirmed: payload.already_confirmed === true,
      funded: payload.funded,
      status,
      amount,
      heldFunding,
      remainingToFund,
    },
    error: null,
  };
}
