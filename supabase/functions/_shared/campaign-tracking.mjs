const slugPattern = /^[A-Za-z0-9_-]{6,80}$/;
const visitorPattern = /^[A-Za-z0-9_-]{16,128}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function recordOf(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : null;
}

export function normalizeClickPayload(input) {
  const body = recordOf(input);
  if (!body) return null;

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const visitorKey = typeof body.visitor_key === "string" ? body.visitor_key.trim() : "";
  if (!slugPattern.test(slug) || !visitorPattern.test(visitorKey)) return null;

  let referrerOrigin = null;
  if (typeof body.referrer_origin === "string" && body.referrer_origin.trim()) {
    try {
      const referrer = new URL(body.referrer_origin.trim());
      if (["http:", "https:"].includes(referrer.protocol) && referrer.hostname) {
        referrerOrigin = referrer.origin;
      }
    } catch {
      referrerOrigin = null;
    }
  }

  return { slug, visitorKey, referrerOrigin };
}

export function normalizeConversionPayload(input) {
  const body = recordOf(input);
  if (!body || Object.prototype.hasOwnProperty.call(body, "creator_id")) return null;

  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id.trim() : "";
  const clickId = typeof body.click_id === "string" ? body.click_id.trim() : "";
  const externalConversionId = typeof body.external_conversion_id === "string"
    ? body.external_conversion_id.trim()
    : "";
  const actionType = typeof body.action_type === "string" ? body.action_type.trim() : "conversion";
  const value = body.value === undefined || body.value === null ? 0 : Number(body.value);

  if (!uuidPattern.test(campaignId) || !slugPattern.test(clickId)) return null;
  if (!externalConversionId || externalConversionId.length > 200 || /[\u0000-\u001f\u007f]/.test(externalConversionId)) return null;
  if (!/^[A-Za-z0-9_.-]{1,50}$/.test(actionType)) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1000000000000) return null;

  return { campaignId, clickId, externalConversionId, actionType, value };
}

export function isSafeHttpUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      && Boolean(url.hostname)
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}
