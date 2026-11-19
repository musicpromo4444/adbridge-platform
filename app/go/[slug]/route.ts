import { NextRequest, NextResponse } from "next/server";

const visitorPattern = /^[A-Za-z0-9_-]{16,128}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(slug)) {
    return NextResponse.json({ error: "Tracking link not found." }, { status: 404 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json({ error: "Tracking is not configured." }, { status: 503 });
  }

  const savedVisitor = request.cookies.get("adbridge_visitor")?.value || "";
  const visitorKey = visitorPattern.test(savedVisitor) ? savedVisitor : crypto.randomUUID();

  let referrerOrigin: string | null = null;
  const rawReferrer = request.headers.get("referer");
  if (rawReferrer) {
    try {
      const referrer = new URL(rawReferrer);
      if (["http:", "https:"].includes(referrer.protocol)) referrerOrigin = referrer.origin;
    } catch {
      referrerOrigin = null;
    }
  }

  let trackingResponse: Response;
  try {
    trackingResponse = await fetch(
      supabaseUrl.replace(/\/$/, "") + "/functions/v1/track-campaign-click",
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug,
          visitor_key: visitorKey,
          referrer_origin: referrerOrigin,
        }),
        cache: "no-store",
      },
    );
  } catch {
    return NextResponse.json({ error: "Tracking is temporarily unavailable." }, { status: 503 });
  }

  const result = await trackingResponse.json().catch(() => null) as { target_url?: unknown } | null;
  if (!trackingResponse.ok) {
    const status = trackingResponse.status === 404 ? 404
      : trackingResponse.status === 400 ? 400
      : trackingResponse.status === 409 ? 409
      : 503;
    return NextResponse.json(
      { error: status === 404 ? "Tracking link not found."
        : status === 400 ? "Invalid tracking link."
        : status === 409 ? "This campaign has reached its target or paid-click budget."
        : "Tracking is temporarily unavailable." },
      { status },
    );
  }

  if (typeof result?.target_url !== "string") {
    return NextResponse.json({ error: "Tracking destination is invalid." }, { status: 502 });
  }

  let destination: URL;
  try {
    destination = new URL(result.target_url);
    if (
      !["http:", "https:"].includes(destination.protocol)
      || !destination.hostname
      || destination.username
      || destination.password
    ) throw new Error("Invalid destination");
  } catch {
    return NextResponse.json({ error: "Tracking destination is invalid." }, { status: 502 });
  }

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("adbridge_visitor", visitorKey, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 31536000,
    path: "/",
  });
  return response;
}
