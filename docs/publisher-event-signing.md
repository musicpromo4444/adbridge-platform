# AdBridge publisher event signing

Website and app publishers can submit impression, click, video-view, install, and conversion events through the `track-ad-event` Supabase Edge Function.

## 1. Issue a property key

An authenticated owner of an already verified publisher property calls:

`POST /functions/v1/publisher-tracking-key`

with their Supabase user access token and JSON body:

```json
{ "property_id": "YOUR_VERIFIED_PROPERTY_UUID" }
```

The function returns a per-property `tracking_secret` once. Store it only in the publisher's server environment. Never put it in browser JavaScript or a public mobile application bundle. Calling the key endpoint again rotates the key and invalidates the previous one.

## 2. Sign each event on the publisher server

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

### Node.js server example

Keep `ADBRIDGE_TRACKING_SECRET` in the publisher server's private environment. Serialize the event once and sign that exact string; do not parse and re-serialize it between signing and sending.

```js
import { createHmac, randomUUID } from "node:crypto";

const payload = {
  placement_key: process.env.ADBRIDGE_PLACEMENT_KEY,
  event_id: randomUUID(),
  event_type: "impression",
  visitor_key: "pseudonymous-visitor-id",
  session_id: "session-id",
  rendered: true,
  viewable_ratio: 0.75,
  visible_ms: 1400,
};

const body = JSON.stringify(payload);
const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = createHmac("sha256", process.env.ADBRIDGE_TRACKING_SECRET)
  .update(timestamp + "." + body, "utf8")
  .digest("hex");

const response = await fetch(
  process.env.ADBRIDGE_SUPABASE_URL + "/functions/v1/track-ad-event",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.ADBRIDGE_SUPABASE_PUBLISHABLE_KEY,
      "x-adbridge-timestamp": timestamp,
      "x-adbridge-signature": signature,
    },
    body,
  },
);

if (!response.ok) {
  throw new Error("AdBridge event rejected: " + response.status);
}
```

For native apps, add `x-adbridge-app-id` with the exact verified app identifier. Use a new event ID for each distinct event, and send the event from a trusted server—not directly from browser code.

## 3. What AdBridge enforces

- Duplicate event IDs are rejected.
- Publisher properties must be verified and belong to the placement owner.
- Website origins and native app identifiers are checked.
- IP and visitor velocity are scored; high-volume IP traffic is rate-limited.
- Client-only telemetry remains unverified and cannot become payable.
- Suspicious events create fraud flags and hold related publisher earnings.


## Key lifecycle status and revocation

Use the authenticated publisher tracking-key Edge Function with the selected verified property.

Status request:

```json
{"action":"status","property_id":"YOUR_PROPERTY_UUID"}
```

Rotate request:

```json
{"action":"rotate","property_id":"YOUR_PROPERTY_UUID"}
```

Revoke request:

```json
{"action":"revoke","property_id":"YOUR_PROPERTY_UUID"}
```

A rotation returns the new `tracking_secret` once with `shown_once: true`. Store it in the publisher's server-side secret manager immediately. Status and revoke responses never return `secret_value`. Every issue, rotation, and revocation creates a private audit record; revoked keys are rejected by the event receiver.
