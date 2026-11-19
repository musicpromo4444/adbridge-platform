# AdBridge CPA / CPI conversion postback

AdBridge accepts a conversion only when it can attribute the action to a real AdBridge creator tracking link.

## Request

POST /functions/v1/track-conversion

Required header:

- x-adbridge-secret: the CPA_POSTBACK_SECRET configured in Supabase Function Secrets

JSON body:

    {
      "campaign_id": "123e4567-e89b-12d3-a456-426614174000",
      "click_id": "c_1234567890abcdef1234",
      "external_conversion_id": "order-9841",
      "action_type": "purchase",
      "value": 12500
    }

Use action_type "install" for CPI campaigns. click_id is the slug from the creator's AdBridge /go/ tracking URL. AdBridge resolves the creator from that saved link; callers must not send creator_id.

## Guarantees and limits

- A postback is rejected if the click link, creator submission, campaign state, or payment model does not match.
- Repeating the same external_conversion_id for the same campaign returns duplicate: true without releasing a second payment.
- Campaign target, confirmed funding, and remaining budget are checked inside one database transaction.
- The conversion event and creator payment are recorded together; the creator receives an earnings notification.
- The function authenticates with CPA_POSTBACK_SECRET; the secret is stored in Supabase Function Secrets and must never be committed here.
