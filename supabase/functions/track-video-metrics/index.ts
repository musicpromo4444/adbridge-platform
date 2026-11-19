import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

type PlatformCredential = {
  platform_user_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  connected: boolean;
};

async function loadPlatformCredential(
  db: any,
  creatorId: string,
  platform: string,
): Promise<{ connection: PlatformCredential | null; error: string | null }> {
  const { data, error } = await db.rpc("get_creator_platform_credentials", {
    p_creator_id: creatorId,
    p_platform: platform,
  });
  if (error) return { connection: null, error: error.message || "Credential lookup failed." };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { connection: null, error: null };
  return { connection: row as PlatformCredential, error: null };
}

function credentialExpired(connection: PlatformCredential) {
  return Boolean(
    connection.expires_at &&
    new Date(connection.expires_at).getTime() <= Date.now(),
  );
}

function youtubeId(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === "youtu.be" || host.endsWith(".youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((x) => x === "shorts" || x === "embed");
      return i >= 0 ? parts[i + 1] : null;
    }
  } catch {}
  return null;
}

function tiktokId(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host !== "tiktok.com" && !host.endsWith(".tiktok.com")) return null;
    const m = u.pathname.match(/\/video\/(\d+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const { submission_id } = await req.json().catch(() => ({}));
  if (!submission_id) return json({ error: "submission_id is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: "Server tracking credentials are not configured." }, 503);
  }
  if (!bearer) return json({ error: "Sign in before requesting metric verification." }, 401);

  // The scheduled aggregator may call this function with the server-only
  // service key. Browser callers must present a real Supabase user session.
  const internalServiceCall = bearer === serviceKey;
  let callerId: string | null = null;
  if (!internalServiceCall) {
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Your session is invalid or expired." }, 401);
    callerId = authData.user.id;
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: submission, error: se } = await db
    .from("submissions")
    .select("id,campaign_id,creator_id,creator_campaign_id,posted_url,tracking_platform,external_video_id,target_metric,current_metric,status")
    .eq("id", submission_id)
    .single();

  if (se || !submission) return json({ error: "Submission not found" }, 404);

  // Only the creator who submitted the work, the advertiser who owns its
  // campaign, or an admin may request a refresh. Never trust a client-sent ID
  // as authorization.
  const [{ data: campaignOwner }, { data: callerProfile }] = await Promise.all([
    db.from("campaigns").select("advertiser_id").eq("id", submission.campaign_id).maybeSingle(),
    callerId ? db.from("profiles").select("role").eq("id", callerId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const isCreator = !!callerId && submission.creator_id === callerId;
  const isAdvertiser = !!callerId && campaignOwner?.advertiser_id === callerId;
  const isAdmin = internalServiceCall || callerProfile?.role === "admin";
  if (!isCreator && !isAdvertiser && !isAdmin) {
    return json({ error: "You are not allowed to refresh this submission." }, 403);
  }
  if (!submission.posted_url && !submission.external_video_id) return json({ error: "No published video URL has been submitted" }, 400);

  let platform = String(submission.tracking_platform || "").toLowerCase();
  let videoId: string | null = null;
  let views = 0;
  let source = "platform_api";
  let raw: Record<string, unknown> = {};

  if (platform === "youtube" || (!platform && /youtu/i.test(submission.posted_url || ""))) {
    platform = "youtube";
    videoId ||= youtubeId(submission.posted_url || "");
    if (!videoId) return json({ error: "Could not identify the YouTube video from the submitted URL." }, 400);
    const { connection, error: credentialError } = await loadPlatformCredential(db, submission.creator_id, "youtube");
    if (credentialError) return json({ error: "YouTube credentials could not be loaded." }, 503);
    if (!connection?.access_token || !connection?.platform_user_id) {
      return json({ error: "Connect your YouTube channel before AdBridge can verify ownership and views." }, 409);
    }
    if (credentialExpired(connection)) {
      return json({ error: "Your YouTube connection has expired. Reconnect your channel to continue tracking." }, 409);
    }
    const u = new URL("https://www.googleapis.com/youtube/v3/videos");
    u.searchParams.set("part", "statistics,snippet");
    u.searchParams.set("id", videoId);
    const headers: Record<string, string> = {};
    headers["Author" + "ization"] = "Bearer " + connection.access_token;
    const r = await fetch(u, { headers });
    const data = await r.json();
    const item = data?.items?.[0];
    if (!r.ok || !item) return json({ error: "YouTube could not return this video.", details: data }, 502);
    if (item.snippet?.channelId !== connection.platform_user_id) {
      return json({ error: "The submitted YouTube video does not belong to the connected channel." }, 403);
    }
    views = Number(item.statistics?.viewCount || 0);
    raw = { id: videoId, title: item.snippet?.title, statistics: item.statistics, channel_id: item.snippet?.channelId };
  } else if (platform === "tiktok") {
    videoId ||= tiktokId(submission.posted_url || "");
    if (!videoId) return json({ error: "Could not identify the TikTok video." }, 400);
    const { connection, error: credentialError } = await loadPlatformCredential(db, submission.creator_id, "tiktok");
    if (credentialError) return json({ error: "TikTok credentials could not be loaded." }, 503);
    if (!connection?.access_token) return json({ error: "TikTok creator connection is required before automatic view tracking can start." }, 409);
    if (credentialExpired(connection)) return json({ error: "Your TikTok connection has expired. Reconnect before tracking views." }, 409);
    const r = await fetch("https://open.tiktokapis.com/v2/video/query/?fields=id,title,view_count,like_count,comment_count,share_count", {
      method: "POST",
      headers: { Authorization: `Bearer ${connection.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filters: { video_ids: [videoId] } }),
    });
    const data = await r.json();
    const item = data?.data?.videos?.[0];
    if (!r.ok || !item) return json({ error: "TikTok could not return this video.", details: data }, 502);
    views = Number(item.view_count || 0);
    raw = item;
  } else if (platform === "x" || platform === "twitter") {
    platform = "x";
    try {
      const postUrl = new URL(submission.posted_url || "");
      if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(postUrl.hostname.toLowerCase())) throw new Error("invalid host");
      videoId ||= postUrl.pathname.match(/status\/(\d+)/)?.[1] || null;
    } catch { return json({ error: "Submit a valid X post URL." }, 400); }
    if (!videoId) return json({ error: "Could not identify the X post." }, 400);
    const { connection, error: credentialError } = await loadPlatformCredential(db, submission.creator_id, "x");
    if (credentialError) return json({ error: "X credentials could not be loaded." }, 503);
    if (!connection?.access_token || !connection?.platform_user_id) return json({ error: "Connect your X account before verifying post views." }, 409);
    if (credentialExpired(connection)) return json({ error: "Your X connection has expired. Reconnect before tracking views." }, 409);
    const u = new URL(`https://api.x.com/2/tweets/${videoId}`);
    u.searchParams.set("tweet.fields", "public_metrics,author_id");
    const r = await fetch(u, { headers: { Authorization: "Bearer " + connection.access_token } });
    const data = await r.json();
    if (!r.ok || !data?.data) return json({ error: "X could not return this post.", details: data }, 502);
    if (data.data.author_id !== connection.platform_user_id) return json({ error: "The submitted X post does not belong to the connected account." }, 403);
    views = Number(data.data.public_metrics?.view_count || 0);
    raw = data.data;
  } else if (platform === "instagram") {
    try {
      const postUrl = new URL(submission.posted_url || "");
      const host = postUrl.hostname.toLowerCase();
      if (host !== "instagram.com" && !host.endsWith(".instagram.com")) throw new Error("invalid host");
      videoId ||= postUrl.pathname.match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/)?.[1] || null;
    } catch { return json({ error: "Submit a valid Instagram post or reel URL." }, 400); }
    if (!videoId) return json({ error: "Could not identify the Instagram post/reel." }, 400);
    const { connection, error: credentialError } = await loadPlatformCredential(db, submission.creator_id, "instagram");
    if (credentialError) return json({ error: "Instagram credentials could not be loaded." }, 503);
    if (!connection?.access_token) return json({ error: "Instagram tracking requires a connected professional creator/business account." }, 409);
    if (credentialExpired(connection)) return json({ error: "Your Instagram connection has expired. Reconnect before tracking views." }, 409);
    const u = new URL(`https://graph.facebook.com/v23.0/${videoId}/insights`);
    u.searchParams.set("metric", "views");
    const r = await fetch(u, { headers: { Authorization: "Bearer " + connection.access_token } });
    const data = await r.json();
    if (!r.ok) return json({ error: "Instagram could not return this media's insights.", details: data }, 502);
    views = Number(data?.data?.find((x: any) => x.name === "views")?.values?.at(-1)?.value || 0);
    raw = data;
  } else if (platform === "facebook") {
    try {
      const postUrl = new URL(submission.posted_url || "");
      const host = postUrl.hostname.toLowerCase();
      if ((host !== "facebook.com" && !host.endsWith(".facebook.com") && host !== "fb.watch")) throw new Error("invalid host");
      videoId ||= postUrl.pathname.match(/(?:videos|reel|watch)\/(\d+)/)?.[1] || null;
    } catch { return json({ error: "Submit a valid Facebook video URL." }, 400); }
    if (!videoId) return json({ error: "Could not identify the Facebook video." }, 400);
    const { connection, error: credentialError } = await loadPlatformCredential(db, submission.creator_id, "facebook");
    if (credentialError) return json({ error: "Facebook credentials could not be loaded." }, 503);
    if (!connection?.access_token) return json({ error: "Facebook tracking requires a connected Page/creator account." }, 409);
    if (credentialExpired(connection)) return json({ error: "Your Facebook connection has expired. Reconnect before tracking views." }, 409);
    const u = new URL(`https://graph.facebook.com/v23.0/${videoId}/insights`);
    u.searchParams.set("metric", "post_media_view");
    const r = await fetch(u, { headers: { Authorization: "Bearer " + connection.access_token } });
    const data = await r.json();
    if (!r.ok) return json({ error: "Facebook could not return this video's insights.", details: data }, 502);
    views = Number(data?.data?.find((x: any) => x.name === "post_media_view")?.values?.at(-1)?.value || 0);
    raw = data;
  } else if (platform === "snapchat") {
    return json({ error: "Snapchat tracking requires the creator to authorize/share eligible Public Profile or Spotlight insights. Automatic API retrieval is not enabled for this account yet.", code: "SNAPCHAT_AUTH_REQUIRED", platform }, 409);
  } else {
    return json({ error: "Automatic tracking for this platform is not connected yet.", platform }, 409);
  }

  // Platform counters are cumulative. A stale API response must never
  // reduce an already-recorded verified count.
  const currentMetric = Math.max(Number(submission.current_metric || 0), views);
  const target = Number(submission.target_metric || 0);
  const reached = target > 0 && currentMetric >= target;
  const now = new Date().toISOString();

  await db.from("submission_metrics").insert({
    submission_id: submission.id,
    platform,
    external_video_id: videoId,
    metric_name: "views",
    metric_value: currentMetric,
    checked_at: now,
    source,
    raw_data: raw,
  });

  const update: Record<string, unknown> = {
    tracking_platform: platform,
    external_video_id: videoId,
    current_metric: currentMetric,
    last_metric_check_at: now,
    tracking_error: null,
  };
  if (reached) {
    update.metric_status = "target_reached";
    update.metric_verified_at = now;
  } else {
    update.metric_status = "tracking";
  }
  const { error: submissionUpdateError } = await db.from("submissions")
    .update(update).eq("id", submission.id);
  if (submissionUpdateError) {
    return json({ error: "Verified metrics could not be saved.", details: submissionUpdateError.message }, 500);
  }

  let payout: unknown = null;
  if (reached) {
    // The database function locks the campaign, enforces the funded budget,
    // and uses the submission's unique payment constraint to prevent races.
    const { data: payoutResult, error: payoutError } = await db.rpc(
      "release_cpm_submission_payment",
      { p_submission_id: submission.id },
    );
    if (payoutError) {
      return json({ error: "Metrics were saved, but creator payout could not be processed.", details: payoutError.message }, 500);
    }
    payout = payoutResult;
  }

  return json({ success: true, platform, video_id: videoId, views: currentMetric, target, reached, payout });
});