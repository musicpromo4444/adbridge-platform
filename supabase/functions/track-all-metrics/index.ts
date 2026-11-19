import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
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
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: "Bearer " + serviceKey },
      body: JSON.stringify({ submission_id: submission.id }),
    });
    if (response.ok) checked++;
    else failed++;
  }
  return Response.json({ success: true, checked, failed, due: (submissions || []).length });
});
