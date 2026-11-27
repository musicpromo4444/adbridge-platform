import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });

const configured = (name: string) => Boolean((Deno.env.get(name) || "").trim());

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !serviceKey) return json({ error: "Authentication required" }, 401);

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Authentication failed" }, 401);

  const { data: profile, error: profileError } = await db
    .from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (profileError || profile?.role !== "admin") return json({ error: "Administrator access required" }, 403);

  const appUrl = Deno.env.get("APP_URL") || "";
  let appUrlValid = false;
  try {
    const parsed = new URL(appUrl);
    appUrlValid = parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    appUrlValid = false;
  }

  const social = {
    tiktok: configured("TIKTOK_CLIENT_ID") && configured("TIKTOK_CLIENT_SECRET"),
    youtube: configured("YOUTUBE_CLIENT_ID") && configured("YOUTUBE_CLIENT_SECRET"),
    meta: configured("META_CLIENT_ID") && configured("META_CLIENT_SECRET"),
    x: configured("X_CLIENT_ID"),
    snapchat: configured("SNAPCHAT_CLIENT_ID") && configured("SNAPCHAT_CLIENT_SECRET"),
  };

  const [{ data: proxySecret }, { data: metricsSecret }] = await Promise.all([
    db.from("adbridge_service_secrets").select("secret_value").eq("key_name", "tracking_proxy").maybeSingle(),
    db.from("adbridge_service_secrets").select("secret_value").eq("key_name", "metrics_scheduler").maybeSingle(),
  ]);

  return json({
    checked_at: new Date().toISOString(),
    payments: {
      paystack: configured("PAYSTACK_SECRET_KEY"),
      paystack_webhook_url: url + "/functions/v1/paystack-webhook",
    },
    application: { app_url: appUrlValid },
    ai: { creator_post_assistant: configured("AI_API_KEY"), video_placement_analysis: configured("AI_API_KEY") },
    social,
    tracking: {
      click_proxy_secret: Boolean(proxySecret?.secret_value),
      cpa_postback_secret: configured("CPA_POSTBACK_SECRET"),
      metrics_scheduler_secret: Boolean(metricsSecret?.secret_value),
    },
    security: { bootstrap_secret_present: configured("ADMIN_BOOTSTRAP_SECRET") },
  });
});
