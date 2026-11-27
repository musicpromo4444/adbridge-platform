import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-adbridge-bootstrap-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: cors });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "POST required" }, 405);

  const expected = Deno.env.get("ADMIN_BOOTSTRAP_SECRET") || "";
  const supplied = request.headers.get("x-adbridge-bootstrap-secret") || "";
  if (!expected) return json({ error: "First-admin bootstrap is not configured." }, 503);
  if (!safeEqual(supplied, expected)) return json({ error: "Invalid bootstrap credential." }, 401);

  const token = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!token || !url || !serviceKey) return json({ error: "Sign in with a confirmed account first." }, 401);

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await db.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Your session could not be verified." }, 401);
  if (!auth.user.email || !auth.user.email_confirmed_at) {
    return json({ error: "Confirm your email address before bootstrapping the administrator account." }, 403);
  }

  const displayName = String(auth.user.user_metadata?.display_name || auth.user.email.split("@")[0] || "AdBridge Administrator").slice(0, 100);
  const { data: created, error: bootstrapError } = await db.rpc("bootstrap_first_admin", {
    p_user_id: auth.user.id,
    p_display_name: displayName,
    p_email: auth.user.email,
  });
  if (bootstrapError) return json({ error: "Administrator bootstrap failed. Please retry or inspect the database logs." }, 500);
  if (!created) return json({ error: "An administrator account already exists. First-admin bootstrap is permanently closed." }, 409);

  return json({ ok: true, message: "Administrator access is active. Remove ADMIN_BOOTSTRAP_SECRET from Edge Function Secrets now." });
});
