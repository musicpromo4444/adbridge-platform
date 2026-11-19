import { NextRequest, NextResponse } from "next/server";

type TrackingResult = { target_url: string; counted: boolean; unique_counted: boolean };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!/^c_[a-f0-9]{20}$/i.test(slug)) {
    return NextResponse.json({ error: "Tracking link not found." }, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const proxySecret = process.env.ADBRIDGE_PROXY_SECRET;
  if (!url || !publishableKey || !proxySecret) {
    return NextResponse.json({ error: "Server-side tracking is not configured." }, { status: 503 });
  }

  const visitor = request.cookies.get("adbridge_visitor")?.value || crypto.randomUUID();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
  const ua = request.headers.get("user-agent") || "";
  const purpose = [
    request.headers.get("purpose") || "",
    request.headers.get("sec-purpose") || "",
    request.headers.get("x-purpose") || "",
  ].join(" ").toLowerCase();
  const isPrefetch = /prefetch|preview|prerender/.test(purpose);
  const isBot = /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|telegrambot|discordbot|linkedinbot|twitterbot|slackbot/i.test(ua);

  // The service-role key stays inside Supabase Edge Functions. This route
  // authenticates to the tracking proxy with a separate server-only secret.
  const tracked = await fetch(url + "/functions/v1/track-click", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      apikey: publishableKey,
      "x-adbridge-proxy-secret": proxySecret,
      "x-adbridge-client-ip": ip,
      "x-adbridge-client-user-agent": ua,
      "x-adbridge-client-referrer": request.headers.get("referer") || "",
    },
    body: JSON.stringify({
      slug,
      visitor_cookie: visitor,
      skip_count: isPrefetch || isBot,
    }),
  }).catch(() => null);

  if (!tracked) {
    return NextResponse.json({ error: "Tracking service is temporarily unavailable." }, { status: 503 });
  }
  const result = await tracked.json().catch(() => null) as TrackingResult | null;
  if (!tracked.ok || !result?.target_url) {
    return NextResponse.json({ error: "Tracking link not found." }, { status: tracked.status === 401 ? 503 : 404 });
  }

  try {
    const destination = new URL(result.target_url);
    if (!["http:", "https:"].includes(destination.protocol)) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Invalid destination." }, { status: 400 });
  }

  const response = NextResponse.redirect(result.target_url, 302);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.cookies.set("adbridge_visitor", visitor, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 31536000,
    path: "/",
  });
  return response;
}
