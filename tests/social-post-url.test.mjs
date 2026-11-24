import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSocialPostUrl } from "../lib/social-post-url.mjs";

test("accepts official HTTPS post domains and normalizes www", () => {
  assert.equal(
    normalizeSocialPostUrl("TikTok", "https://www.tiktok.com/@creator/video/123#share"),
    "https://www.tiktok.com/@creator/video/123",
  );
  assert.equal(
    normalizeSocialPostUrl("YouTube Shorts", "https://youtu.be/abc123"),
    "https://youtu.be/abc123",
  );
  assert.equal(
    normalizeSocialPostUrl("X", "https://twitter.com/example/status/123"),
    "https://twitter.com/example/status/123",
  );
});

test("rejects HTTP, credentials, ports and unsupported schemes", () => {
  for (const url of [
    "http://tiktok.com/@creator/video/1",
    "https://user:pass@tiktok.com/@creator/video/1",
    "https://tiktok.com:8443/@creator/video/1",
    "javascript:alert(1)",
  ]) {
    assert.throws(() => normalizeSocialPostUrl("TikTok", url));
  }
});

test("rejects lookalike and arbitrary subdomains", () => {
  for (const url of [
    "https://evil-tiktok.com/@creator/video/1",
    "https://tiktok.com.evil.example/@creator/video/1",
    "https://uploads.tiktok.com/@creator/video/1",
    "https://evil.instagram.com/reel/123",
  ]) {
    assert.throws(() => normalizeSocialPostUrl("TikTok", url));
  }
});

test("requires exact platform and domain pairing", () => {
  assert.throws(() => normalizeSocialPostUrl("Instagram", "https://youtube.com/watch?v=1"));
  assert.throws(() => normalizeSocialPostUrl("Unknown", "https://example.com/post/1"));
});
