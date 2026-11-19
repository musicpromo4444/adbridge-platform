import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function challenge(value: string) {
  return b64(new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  )));
}

function env(platform: string, key: string) {
  return Deno.env.get(platform.toUpperCase() + "_" + key) || "";
}

function redirectToConnections(appUrl: URL, query: Record<string, string>) {
  const target = new URL("/creator/connections", appUrl);
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value);
  return Response.redirect(target.toString(), 302);
}

async function platformAccountId(platform: string, accessToken: string): Promise<string | null> {
  let endpoint = "";
  if (platform === "youtube") {
    endpoint = "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true";
  } else if (platform === "tiktok") {
    endpoint = "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name";
  } else if (platform === "x") {
    endpoint = "https://api.x.com/2/users/me";
  } else if (platform === "instagram" || platform === "facebook") {
    endpoint = "https://graph.facebook.com/v23.0/me?fields=id";
  } else {
    return null;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Authorization: "Bearer " + accessToken },
    });
  } catch {
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) return null;

  if (platform === "youtube") return payload?.items?.[0]?.id || null;
  if (platform === "tiktok") return payload?.data?.user?.open_id || null;
  if (platform === "x") return payload?.data?.id || null;
  return payload?.id || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "POST or GET required." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const configuredAppUrl = Deno.env.get("APP_URL");
  if (!supabaseUrl || !serviceRoleKey || !configuredAppUrl) {
    return json({ error: "Social account connections are not configured." }, 503);
  }

  let appUrl: URL;
  try {
    appUrl = new URL(configuredAppUrl);
  } catch {
    return json({ error: "APP_URL is invalid." }, 503);
  }
  if (appUrl.protocol !== "https:" && appUrl.hostname !== "localhost") {
    return json({ error: "APP_URL must use HTTPS." }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  if (req.method === "POST") {
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return json({ error: "Authentication required." }, 401);

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: "Authentication failed." }, 401);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || profile?.role !== "creator") {
      return json({ error: "Creator access is required to connect social accounts." }, 403);
    }

    const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
    const platform = typeof payload?.platform === "string" ? payload.platform.toLowerCase() : "";
    const allowed = ["tiktok", "youtube", "instagram", "facebook", "x", "snapchat"];
    if (!allowed.includes(platform)) return json({ error: "Unsupported platform." }, 400);

    const redirectUri = supabaseUrl.replace(/\/$/, "") + "/functions/v1/social-oauth-start";
    const state = b64(crypto.getRandomValues(new Uint8Array(24)));
    let verifier = "";
    if (platform === "x") verifier = b64(crypto.getRandomValues(new Uint8Array(32)));

    const params = new URLSearchParams();
    let authorizationUrl = "";

    if (platform === "tiktok") {
      const clientId = env(platform, "CLIENT_ID");
      if (!clientId) return json({ error: "TikTok connection is not configured yet." }, 503);
      params.set("client_key", clientId);
      params.set("response_type", "code");
      params.set("scope", "user.info.basic,video.list");
      params.set("redirect_uri", redirectUri);
      params.set("state", state);
      authorizationUrl = "https://www.tiktok.com/v2/auth/authorize/?" + params.toString();
    } else if (platform === "youtube") {
      const clientId = env(platform, "CLIENT_ID");
      if (!clientId) return json({ error: "YouTube connection is not configured yet." }, 503);
      params.set("client_id", clientId);
      params.set("redirect_uri", redirectUri);
      params.set("response_type", "code");
      params.set("scope", "https://www.googleapis.com/auth/youtube.readonly");
      params.set("access_type", "offline");
      params.set("prompt", "consent");
      params.set("state", state);
      authorizationUrl = "https://accounts.google.com/o/oauth2/v2/auth?" + params.toString();
    } else if (platform === "instagram" || platform === "facebook") {
      const clientId = env("meta", "CLIENT_ID");
      if (!clientId) return json({ error: "Meta connection is not configured yet." }, 503);
      params.set("client_id", clientId);
      params.set("redirect_uri", redirectUri);
      params.set("response_type", "code");
      params.set("scope", "pages_show_list,pages_read_engagement,instagram_basic,instagram_manage_insights");
      params.set("state", state);
      authorizationUrl = "https://www.facebook.com/v23.0/dialog/oauth?" + params.toString();
    } else if (platform === "x") {
      const clientId = env(platform, "CLIENT_ID");
      if (!clientId) return json({ error: "X connection is not configured yet." }, 503);
      params.set("response_type", "code");
      params.set("client_id", clientId);
      params.set("redirect_uri", redirectUri);
      params.set("scope", "tweet.read users.read offline.access");
      params.set("state", state);
      params.set("code_challenge", await challenge(verifier));
      params.set("code_challenge_method", "S256");
      authorizationUrl = "https://x.com/i/oauth2/authorize?" + params.toString();
    } else {
      const clientId = env(platform, "CLIENT_ID");
      if (!clientId) return json({ error: "Snapchat connection is not configured yet." }, 503);
      params.set("client_id", clientId);
      params.set("redirect_uri", redirectUri);
      params.set("response_type", "code");
      params.set("scope", "snapchat-profile-api");
      params.set("state", state);
      authorizationUrl = "https://accounts.snapchat.com/login/oauth2/authorize?" + params.toString();
    }

    const { error: stateError } = await supabase.from("social_oauth_states").insert({
      state,
      creator_id: user.id,
      platform,
      code_verifier: verifier || null,
      redirect_uri: redirectUri,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) return json({ error: "Could not start the social account connection." }, 500);

    return json({ url: authorizationUrl });
  }

  const callbackUrl = new URL(req.url);
  const code = callbackUrl.searchParams.get("code");
  const state = callbackUrl.searchParams.get("state");
  const providerError = callbackUrl.searchParams.get("error");
  if (providerError) return redirectToConnections(appUrl, { error: "platform_authorization_denied" });
  if (!code || !state) return json({ error: "OAuth callback requires code and state." }, 400);

  // Delete-and-return makes the state one-time even if the provider retries its callback.
  const { data: oauthState, error: consumeError } = await supabase
    .from("social_oauth_states")
    .delete()
    .eq("state", state)
    .gt("expires_at", new Date().toISOString())
    .select("id,creator_id,platform,code_verifier,redirect_uri")
    .maybeSingle();

  if (consumeError || !oauthState) {
    return json({ error: "OAuth session expired, invalid, or already used." }, 400);
  }

  const platform = String(oauthState.platform || "").toLowerCase();
  const redirectUri = String(oauthState.redirect_uri || "");
  let tokenUrl = "";
  const tokenBody: Record<string, string> = {};

  if (platform === "tiktok") {
    tokenUrl = "https://open.tiktokapis.com/v2/oauth/token/";
    tokenBody.client_key = env(platform, "CLIENT_ID");
    tokenBody.client_secret = env(platform, "CLIENT_SECRET");
    tokenBody.code = code;
    tokenBody.grant_type = "authorization_code";
    tokenBody.redirect_uri = redirectUri;
  } else if (platform === "youtube") {
    tokenUrl = "https://oauth2.googleapis.com/token";
    tokenBody.client_id = env(platform, "CLIENT_ID");
    tokenBody.client_secret = env(platform, "CLIENT_SECRET");
    tokenBody.code = code;
    tokenBody.grant_type = "authorization_code";
    tokenBody.redirect_uri = redirectUri;
  } else if (platform === "instagram" || platform === "facebook") {
    tokenUrl = "https://graph.facebook.com/v23.0/oauth/access_token";
    tokenBody.client_id = env("meta", "CLIENT_ID");
    tokenBody.client_secret = env("meta", "CLIENT_SECRET");
    tokenBody.code = code;
    tokenBody.redirect_uri = redirectUri;
  } else if (platform === "x") {
    tokenUrl = "https://api.x.com/2/oauth2/token";
    tokenBody.client_id = env(platform, "CLIENT_ID");
    tokenBody.code = code;
    tokenBody.grant_type = "authorization_code";
    tokenBody.redirect_uri = redirectUri;
    tokenBody.code_verifier = String(oauthState.code_verifier || "");
  } else if (platform === "snapchat") {
    tokenUrl = "https://accounts.snapchat.com/login/oauth2/access_token";
    tokenBody.client_id = env(platform, "CLIENT_ID");
    tokenBody.client_secret = env(platform, "CLIENT_SECRET");
    tokenBody.code = code;
    tokenBody.grant_type = "authorization_code";
    tokenBody.redirect_uri = redirectUri;
  } else {
    return json({ error: "Unsupported OAuth callback platform." }, 400);
  }

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenBody),
    });
  } catch {
    return json({ error: "The platform token service could not be reached. Restart the connection." }, 502);
  }

  const tokenPayload = await tokenResponse.json().catch(() => null) as Record<string, unknown> | null;
  const accessToken = typeof tokenPayload?.access_token === "string" ? tokenPayload.access_token : "";
  if (!tokenResponse.ok || !accessToken) {
    return json({ error: "The platform did not complete the account authorization. Restart the connection." }, 502);
  }

  const platformUserId = await platformAccountId(platform, accessToken);
  if (platform !== "snapchat" && !platformUserId) {
    return json({ error: "The platform did not return your authenticated account ID. Reconnect and try again." }, 502);
  }

  const expiresIn = Number(tokenPayload?.expires_in);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;
  const refreshToken = typeof tokenPayload?.refresh_token === "string"
    ? tokenPayload.refresh_token
    : null;

  const { data: stored, error: storeError } = await supabase.rpc("upsert_creator_platform_credentials", {
    p_creator_id: oauthState.creator_id,
    p_platform: platform,
    p_platform_user_id: platformUserId,
    p_access_token: accessToken,
    p_refresh_token: refreshToken,
    p_expires_at: expiresAt,
  });

  if (storeError || stored?.success !== true) {
    return json({ error: "The platform connection could not be saved. Restart the connection." }, 500);
  }

  return redirectToConnections(appUrl, { connected: platform });
});
