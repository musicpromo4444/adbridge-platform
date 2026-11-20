# Creator video placement analysis

The Creator Studio no longer generates a timed mock preview. It samples six resized JPEG frames from the creator's locally selected video and sends those frames, the selected campaign image asset, campaign ID, platform, and placement style to the authenticated analyze-creator-placement Edge Function.

## Data handling

- The original video stays in the creator's browser and is not uploaded to AdBridge.
- Only four to six sampled JPEG frames (maximum 640 px on the longest edge) are sent to the configured AI provider.
- AdBridge stores the validated placement plan and metadata in public.creator_placement_jobs; it does not store the sampled frames or original video.
- A creator can read only their own placement jobs. Advertisers cannot read creator placement jobs or creator identity through this feature.
- The selected logo/brand image must already be an image asset attached to the active campaign in the campaign-assets bucket.

## AI provider configuration

The Edge Function uses the same server-side OpenAI-compatible configuration as the existing creator AI assistant:

- AI_API_KEY — required secret; never expose it to the browser.
- AI_BASE_URL — optional HTTPS API base URL, defaults to https://api.openai.com/v1.
- AI_MODEL — optional model name, defaults to gpt-4o-mini.

The provider must support Chat Completions vision image inputs and JSON-object responses. If AI_API_KEY is absent or the provider fails, the function returns an error and does not create a successful placement result.

## Result contract

The provider must return JSON with:

- placement: null or a normalized rectangle (x, y, width, height), a time window (start_seconds, end_seconds), confidence from 0 to 1, and an anchor.
- reasoning: a short explanation.
- safe_areas and blocked_areas: optional arrays of normalized rectangles with labels.
- warnings: optional strings.

The server validates geometry, timing, confidence, and frame bounds before persisting the result. A null placement is a valid outcome when the sampled content has no safe space. The confidence value is the model's estimate, not a guarantee of correctness or platform-policy compliance.

## Deployment

Apply supabase/migrations/20261120182000_adbridge_creator_video_placement_jobs.sql before enabling the Edge Function. Deploy supabase/functions/analyze-creator-placement/index.ts with JWT verification enabled. Configure the AI secrets in Supabase Edge Function Secrets before expecting successful analyses.
