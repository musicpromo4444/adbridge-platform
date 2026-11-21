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
  let raw: Record<string, unknown> = {};

  if (platform === "youtube" || (!platform && /youtu/i.test(submission.posted_url || ""))) {
    platform = "youtube";
    videoId ||= youtubeId(submission.posted_url || "");
    if (!videoId) return json({ error: "Could not identify the YouTube video from the submitted URL." }, 400);
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,platform_user_id,connected,expires_at")
      .eq("creator_id", submission.creator_id)
      .eq("platform", "youtube")
      .eq("connected", true)
      .maybeSingle();
    if (!connection?.access_token || !connection?.platform_user_id) {
      return json({ error: "Connect your YouTube channel before AdBridge can verify ownership and views." }, 409);
    }
    if (connection.expires_at && new Date(connection.expires_at).getTime() <= Date.now()) {
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
    const { data: connection } = await db
      .from("creator_platform_connections")
      .select("access_token,connected,expires_at")
      .eq("creator_id", submission.creator_id)
      .eq("platform", "tiktok")
      .eq("connected", true)
      .maybeSingle();
    if (!connection?.access_token) return json({ error: "TikTok creator connection is required before automatic view tracking can start." }, 409);
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
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,connected,platform_user_id").eq("creator_id", submission.creator_id).eq("platform", "x").eq("connected", true).maybeSingle();
    if (!connection?.access_token || !connection?.platform_user_id) return json({ error: "Connect your X account before verifying post views." }, 409);
    const u = new URL(`https://api.x.com/2/tweets/${videoId}`);
    u.searchParams.set("tweet.fields", "public_metrics,author_id");
    const r = await fetch(u, { headers: { Authorization: `Bearer ${connection.access_token}` } });
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
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,connected").eq("creator_id", submission.creator_id).eq("platform", "instagram").eq("connected", true).maybeSingle();
    if (!connection?.access_token) return json({ error: "Instagram tracking requires a connected professional creator/business account." }, 409);
    const u = new URL(`https://graph.facebook.com/v23.0/${videoId}/insights`);
    u.searchParams.set("metric", "views");
    u.searchParams.set("access_token", connection.access_token);
    const r = await fetch(u);
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
    const { data: connection } = await db.from("creator_platform_connections")
      .select("access_token,connected").eq("creator_id", submission.creator_id).eq("platform", "facebook").eq("connected", true).maybeSingle();
    if (!connection?.access_token) return json({ error: "Facebook tracking requires a connected Page/creator account." }, 409);
    const u = new URL(`https://graph.facebook.com/v23.0/${videoId}/insights`);
    u.searchParams.set("metric", "post_media_view");
    u.searchParams.set("access_token", connection.access_token);
    const r = await fetch(u);
    const data = await r.json();
    if (!r.ok) return json({ error: "Facebook could not return this video's insights.", details: data }, 502);
    views = Number(data?.data?.find((x: any) => x.name === "post_media_view")?.values?.at(-1)?.value || 0);
    raw = data;
  } else if (platform === "snapchat") {
    return json({ error: "Snapchat tracking requires the creator to authorize/share eligible Public Profile or Spotlight insights. Automatic API retrieval is not enabled for this account yet.", code: "SNAPCHAT_AUTH_REQUIRED", platform }, 409);
  } else {
    return json({ error: "Automatic tracking for this platform is not connected yet.", platform }, 409);
  }

  // Provider counters must be finite, non-negative safe integers before they
  // can enter the auditable metric ledger or trigger a CPM payout.
  if (!videoId) return json({ error: "The platform did not return a usable video identifier." }, 502);
  if (!Number.isSafeInteger(views) || views < 0) {
    return json({ error: "The platform returned an invalid view count. No metric or payout was recorded." }, 502);
  }

  // One database transaction writes the immutable snapshot, updates the
  // monotonic submission summary, and invokes the existing budget-gated CPM
  // payout function. If any step fails, none of those writes are committed.
  const { data: metricResult, error: metricError } = await db.rpc(
    "record_submission_metric_snapshot",
    {
      p_submission_id: submission.id,
      p_platform: platform,
      p_external_video_id: videoId,
      p_metric_value: views,
      p_raw_data: raw,
    },
  );

  if (metricError || !metricResult || metricResult.success !== true) {
    console.error("Atomic metric snapshot transaction failed", metricError?.message || "invalid RPC response");
    return json({
      error: "Verified metrics could not be committed. No CPM payout was processed.",
    }, 500);
  }

  return json({
    success: true,
    snapshot_id: metricResult.snapshot_id,
    platform: metricResult.platform,
    video_id: metricResult.video_id,
    views: metricResult.views,
    provider_views: metricResult.provider_views,
    target: metricResult.target,
    reached: metricResult.reached,
    stale_snapshot: metricResult.stale_snapshot,
    checked_at: metricResult.checked_at,
    payout: metricResult.payout ?? null,
  });
});