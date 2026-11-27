import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });

  // Keep the scheduled entrypoint callable by Supabase's configured scheduler,
  // but never trust a caller-supplied service key. The public key only starts
  // a bounded refresh; all writes happen inside server-side functions.
  const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const allowed = new Set(Object.values(keys));
  const legacy = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (legacy) allowed.add(legacy);
  const supplied = req.headers.get("apikey") || "";
  if (!allowed.has(supplied)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = legacy || supplied;
  if (!url || !serviceKey) return Response.json({ error: "Scheduler credentials are not configured" }, { status: 503 });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: schedulerSecret, error: secretError } = await db.from("adbridge_service_secrets")
    .select("secret_value").eq("key_name", "metrics_scheduler").maybeSingle();
  const suppliedSchedulerSecret = req.headers.get("x-adbridge-cron-secret") || "";
  if (secretError || !schedulerSecret?.secret_value || !safeEqual(suppliedSchedulerSecret, String(schedulerSecret.secret_value))) {
    return Response.json({ error: "Unauthorized scheduler request" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: submissions, error } = await db.from("submissions")
    .select("id,campaigns!inner(payment_method,status)")
    .in("status", ["waiting", "submitted"])
    .in("campaigns.payment_method", ["views", "cpm"])
    .eq("campaigns.status", "active")
    .or(`last_metric_check_at.is.null,last_metric_check_at.lt.${cutoff}`)
    .limit(100);
  if (error) return Response.json({ error: "Could not load due metric checks", details: error.message }, { status: 500 });

  let checked = 0;
  let failed = 0;
  for (const submission of submissions || []) {
    const response = await fetch(url + "/functions/v1/track-video-metrics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: "Bearer " + serviceKey,
      },
      body: JSON.stringify({ submission_id: submission.id }),
    });
    if (response.ok) checked++;
    else failed++;
  }

  // CPC payouts are recorded atomically at the unique click event. Do not
  // infer payable clicks from cumulative redirect counters in a cron job.
  return Response.json({ success: true, checked, failed, due: (submissions || []).length });
});
