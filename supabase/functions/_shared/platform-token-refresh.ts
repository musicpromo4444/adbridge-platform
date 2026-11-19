export type PlatformRefreshStatus =
  | "refreshed"
  | "not_due"
  | "in_progress"
  | "rate_limited"
  | "reconnect_required"
  | "not_connected"
  | "unsupported"
  | "provider_error"
  | "error";

export type PlatformRefreshResult = {
  status: PlatformRefreshStatus;
  expires_at?: string | null;
};

type CredentialClaim = {
  claim_status?: string;
  platform_user_id?: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
};

const refreshablePlatforms = new Set(["youtube", "tiktok"]);

async function recordFailure(
  db: any,
  creatorId: string,
  platform: string,
  errorCode: string,
  reauthRequired = false,
) {
  await db.rpc("fail_creator_platform_refresh", {
    p_creator_id: creatorId,
    p_platform: platform,
    p_error_code: errorCode,
    p_reauth_required: reauthRequired,
  });
}

export async function refreshPlatformCredential(
  db: any,
  creatorId: string,
  platformInput: string,
  force: boolean,
): Promise<PlatformRefreshResult> {
  const platform = String(platformInput || "").toLowerCase();
  if (!refreshablePlatforms.has(platform)) return { status: "unsupported" };

  const { data: claimData, error: claimError } = await db.rpc(
    "claim_creator_platform_refresh",
    {
      p_creator_id: creatorId,
      p_platform: platform,
      p_force: force,
    },
  );
  if (claimError) return { status: "error" };

  const claim = (Array.isArray(claimData) ? claimData[0] : claimData) as CredentialClaim | null;
  const claimStatus = String(claim?.claim_status || "");
  if (claimStatus !== "claimed") {
    const known = new Set([
      "not_due",
      "in_progress",
      "rate_limited",
      "reconnect_required",
      "not_connected",
      "unsupported",
    ]);
    return {
      status: known.has(claimStatus) ? claimStatus as PlatformRefreshStatus : "error",
      expires_at: claim?.expires_at || null,
    };
  }

  const refreshToken = typeof claim?.refresh_token === "string" ? claim.refresh_token : "";
  if (!refreshToken) {
    await recordFailure(db, creatorId, platform, "invalid_response", true);
    return { status: "reconnect_required" };
  }

  const clientId = Deno.env.get(platform.toUpperCase() + "_CLIENT_ID") || "";
  const clientSecret = Deno.env.get(platform.toUpperCase() + "_CLIENT_SECRET") || "";
  if (!clientId || !clientSecret) {
    await recordFailure(db, creatorId, platform, "provider_not_configured");
    return { status: "provider_error" };
  }

  const endpoint = platform === "youtube"
    ? "https://oauth2.googleapis.com/token"
    : "https://open.tiktokapis.com/v2/oauth/token/";

  const body = platform === "youtube"
    ? new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })
    : new URLSearchParams({
      client_key: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    await recordFailure(db, creatorId, platform, "network_error");
    return { status: "provider_error" };
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const providerError = typeof payload?.error === "string"
      ? payload.error.toLowerCase()
      : "";
    const reauthRequired = providerError === "invalid_grant" || providerError === "access_denied";
    await recordFailure(
      db,
      creatorId,
      platform,
      reauthRequired ? "invalid_grant" : "provider_error",
      reauthRequired,
    );
    return { status: reauthRequired ? "reconnect_required" : "provider_error" };
  }

  const accessToken = typeof payload?.access_token === "string" ? payload.access_token : "";
  const expiresIn = Number(payload?.expires_in);
  if (
    !accessToken ||
    !Number.isFinite(expiresIn) ||
    expiresIn < 60 ||
    expiresIn > 86_400
  ) {
    await recordFailure(db, creatorId, platform, "invalid_response");
    return { status: "provider_error" };
  }

  let nextRefreshToken = refreshToken;
  if (platform === "tiktok") {
    const rotated = typeof payload?.refresh_token === "string" ? payload.refresh_token : "";
    if (!rotated) {
      // TikTok rotates refresh tokens. If the response omits the replacement,
      // the previous token may already be invalid, so require a fresh consent.
      await recordFailure(db, creatorId, platform, "invalid_response", true);
      return { status: "reconnect_required" };
    }
    nextRefreshToken = rotated;
  } else if (typeof payload?.refresh_token === "string" && payload.refresh_token.length > 0) {
    nextRefreshToken = payload.refresh_token;
  }

  const expiresAt = new Date(Date.now() + Math.floor(expiresIn) * 1000).toISOString();
  const { data: stored, error: storeError } = await db.rpc(
    "upsert_creator_platform_credentials",
    {
      p_creator_id: creatorId,
      p_platform: platform,
      p_platform_user_id: claim?.platform_user_id || null,
      p_access_token: accessToken,
      p_refresh_token: nextRefreshToken,
      p_expires_at: expiresAt,
      p_is_refresh: true,
    },
  );

  if (storeError || stored?.success !== true) {
    const tokenRotated = platform === "tiktok" && nextRefreshToken !== refreshToken;
    await recordFailure(
      db,
      creatorId,
      platform,
      "provider_error",
      tokenRotated,
    );
    return { status: tokenRotated ? "reconnect_required" : "provider_error" };
  }

  return { status: "refreshed", expires_at: expiresAt };
}
