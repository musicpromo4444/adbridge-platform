const PLATFORM_HOSTS = Object.freeze({
  tiktok: ["tiktok.com"],
  "instagram reels": ["instagram.com"],
  instagram: ["instagram.com"],
  youtube: ["youtube.com", "youtu.be"],
  "youtube shorts": ["youtube.com", "youtu.be"],
  facebook: ["facebook.com"],
  "facebook reels": ["facebook.com"],
  x: ["x.com", "twitter.com"],
  snapchat: ["snapchat.com"],
});

export function normalizeSocialPostUrl(platform, value) {
  if (typeof platform !== "string" || typeof value !== "string" || !value.trim()) {
    throw new Error("Choose a platform and enter its public post URL.");
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid public social post URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("Use a public HTTPS post URL without credentials or a custom port.");
  }
  const allowedHosts = PLATFORM_HOSTS[platform.trim().toLowerCase()];
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!allowedHosts || !allowedHosts.includes(hostname)) {
    throw new Error("The post URL must use the selected platform's official domain.");
  }
  if (!url.pathname || url.pathname === "/") {
    throw new Error("Enter a link to an actual post, not the platform homepage.");
  }
  if (url.hash) url.hash = "";
  return url.toString();
}
