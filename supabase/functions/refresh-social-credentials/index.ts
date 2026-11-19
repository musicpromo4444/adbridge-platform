import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refreshPlatformCredential } from "../_shared/platform-token-refresh.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.match(/^Bearer\\s+(.+)$/i)?.[1]?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Platform credential refresh is not configured." }, 503);
  }
  if (!token) return json({ error: "Authentication required." }, 401);

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data: authData, error: authError } = await db.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return json({ error: "Authentication failed." }, 401);

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "creator") {
    return json({ error: "Creator access is required." }, 403);
  }

  const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
  const platform = typeof payload?.platform === "string"
    ? payload.platform.toLowerCase()
    : "";
  if (platform !== "youtube" && platform !== "tiktok") {
    return json({
      error: "Automatic refresh is currently supported only for YouTube and TikTok.",
      code: "UNSUPPORTED_PLATFORM",
    }, 400);
  }

  const result = await refreshPlatformCredential(db, user.id, platform, true);
  if (result.status === "refreshed") {
    return json({
      success: true,
      status: "refreshed",
      platform,
      expires_at: result.expires_at || null,
    });
  }

  if (result.status === "rate_limited") {
    return json({ success: false, code: "RATE_LIMITED" }, 429);
  }
  if (result.status === "in_progress") {
    return json({ success: false, code: "REFRESH_IN_PROGRESS" }, 409);
  }
  if (result.status === "reconnect_required" || result.status === "not_connected") {
    return json({ success: false, code: "RECONNECT_REQUIRED" }, 409);
  }

  return json({ success: false, code: "REFRESH_FAILED" }, 502);
});
