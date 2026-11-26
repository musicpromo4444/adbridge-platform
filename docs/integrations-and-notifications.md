# AdBridge Integrations and Notifications

## Supported connection paths

- Creator social OAuth: TikTok, YouTube, Instagram, Facebook, X and Snapchat. Provider availability depends on the OAuth credentials, permissions and eligible account types configured for the environment.
- Publisher ad delivery: register website, web app, Android or iOS inventory; verify ownership; apply to compatible campaigns; fetch approved ad placements; send signed events.
- Measurement: campaign results and analytics show raw and verified activity separately.
- In-app notifications: publisher application decisions, creator submission reviews, campaign status, funding confirmation, CPM payout release, withdrawal status and creator verification decisions.

## OAuth security

Tokens are stored server-side and are not returned to advertisers. Disconnecting a social account uses a server-side RPC that clears stored access/refresh tokens, platform identity and expiry fields. Users should also revoke the grant in the provider's account-security settings when applicable.

## Notification delivery

The in-app inbox is protected by per-user RLS. Users can read their own notifications and update only the `is_read` column. Event triggers create notices for key state transitions; the notification table is published to Supabase Realtime for unread-count updates.

## Publisher event integration

The publisher server integration guide includes the approved-ad fetch endpoint and the HMAC-signed event tracking requirements. Tracking-link clicks are never treated as verified video views. Publisher and platform events must pass fraud assessment before they qualify as verified or payable.

No creator–advertiser direct chat or proposal system is provided.
