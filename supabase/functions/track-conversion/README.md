# AdBridge CPA / CPI conversion postback

AdBridge accepts a conversion only when it can attribute the action to a saved creator tracking link and the campaign has available funding and target capacity.

## Request

POST `{SUPABASE_URL}/functions/v1/track-conversion`

Required headers:

- `Content-Type: application/json`
- `x-adbridge-secret: YOUR_CAMPAIGN_POSTBACK_SECRET`

Advertisers can generate or rotate a campaign-specific credential from **Your Campaigns → Conversion setup**. The plaintext is shown once; AdBridge stores only its SHA-256 hash. Rotating it immediately invalidates the previous value.

During rollout, campaigns without a campaign-specific credential may still use the legacy `CPA_POSTBACK_SECRET` if that server secret is configured. Once a campaign-specific credential exists, the shared fallback is ignored for that campaign.

JSON body:

```json
{
  "campaign_id": "123e4567-e89b-12d3-a456-426614174000",
  "click_id": "c_1234567890abcdef1234",
  "external_conversion_id": "order-9841",
  "action_type": "purchase",
  "value": 12500
}
```

Use action_type `install` for CPI campaigns. `click_id` is the short slug from the creator's AdBridge `/go/` tracking URL, not the full URL. `external_conversion_id` must be unique within the campaign so provider retries cannot pay twice.

Do not send `creator_id`. AdBridge resolves creator attribution from the stored tracking link and deliberately omits creator identity from the postback response.

## Guarantees and limits

- Campaign-specific secrets are generated only after an authenticated advertiser/admin ownership check. The database stores hashes, never plaintext.
- A campaign-specific secret takes precedence over the legacy shared secret.
- The database checks campaign state, payment model, tracking-link ownership, duplicate external conversion IDs, target capacity, confirmed funded budget, and available budget inside a transaction.
- A click is not proof of an install or purchase. CPI/CPA events require this authenticated server-to-server postback.
- The response contains event/payment status only; it does not disclose creator identity.
- Never put the postback secret in browser code, campaign content, a public repository, or client-side analytics.
