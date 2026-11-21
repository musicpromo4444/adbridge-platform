# AdBridge publisher event signing

Website and app publishers submit impression, click, video-view, install, and conversion events through the `track-ad-event` Supabase Edge Function.

## 1. Issue a property key

An authenticated owner of an already verified publisher property calls:

`POST /functions/v1/publisher-tracking-key`

with their Supabase user access token and JSON body:

```json
{ "property_id": "YOUR_VERIFIED_PROPERTY_UUID", "action": "rotate" }
```

For compatibility, omitting `action` still means `rotate`. The endpoint returns a per-property `tracking_secret` once. Store it only in the publisher's private server environment. Never put it in browser JavaScript, a public repository, or a public mobile application bundle.

Each rotation increments the key version, records an audit event, clears any previous revocation, and immediately invalidates the old secret. The response includes non-secret status metadata alongside the one-time new secret.

## 2. Check or revoke a key

The same authenticated owner can check status without receiving the secret:

```json
{ "property_id": "YOUR_VERIFIED_PROPERTY_UUID", "action": "status" }
```

The response reports whether a key exists, whether it is currently active, its version, last rotation time, and revocation time. It never returns `secret_value`.

To revoke a key immediately:

```json
{ "property_id": "YOUR_VERIFIED_PROPERTY_UUID", "action": "revoke" }
```

Revocation is idempotent and does not delete the audit record. AdBridge's event receiver rejects signatures for a revoked key. A new key can be issued later if the property remains verified.

## 3. Sign each event on the publisher server

Build the exact JSON body, then sign the timestamp and exact raw body:

```text
message = unix_timestamp_seconds + "." + exact_request_body
signature = lowercase_hex(HMAC_SHA256(tracking_secret, message))
```

Send these headers to `POST /functions/v1/track-ad-event`:

- `x-adbridge-timestamp`: Unix timestamp in seconds
- `x-adbridge-signature`: lowercase hex HMAC-SHA256 signature
- `x-adbridge-app-id`: required for native Android/iOS properties; must match the registered app identifier

Example event body:

```json
{
  "placement_key": "YOUR_PLACEMENT_KEY",
  "event_id": "unique-event-id",
  "event_type": "impression",
  "visitor_key": "pseudonymous-visitor-id",
  "session_id": "session-id",
  "rendered": true,
  "viewable_ratio": 0.75,
  "visible_ms": 1400
}
```

For a video-view event, include `playback_started`, `watch_seconds`, `heartbeat_count`, and `page_visible`. For installs/conversions include a server-generated `receipt_id`.

The signature must be generated on the publisher's server. AdBridge never trusts a client-supplied `server_verified` field. It sets the trusted flag only after validating the per-property HMAC, a five-minute timestamp window, the verified property/placement association, and event evidence.

## 4. What AdBridge enforces

- Duplicate event IDs are rejected.
- Publisher properties must be verified and belong to the placement owner.
- Website origins and native app identifiers are checked.
- IP and visitor velocity are scored; high-volume IP traffic is rate-limited.
- Client-only telemetry remains unverified and cannot become payable.
- Suspicious events create fraud flags and hold related publisher earnings.
- Rotated and revoked signing keys invalidate previous signatures.
- Key lifecycle audit records contain the actor, property, action, key version, and timestamp, but never the secret.
