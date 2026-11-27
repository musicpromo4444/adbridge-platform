import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://adbridge-platform.vercel.app";
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: new URL("/rankings", base).toString(), lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: new URL("/signup", base).toString(), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: new URL("/help", base).toString(), lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: new URL("/integrations", base).toString(), lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: new URL("/privacy", base).toString(), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: new URL("/terms", base).toString(), lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
