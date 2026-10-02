# Web-chat push notifications

Deploy backend and frontend together; HTTPS is required. No Android installation
or Apple Developer subscription is needed. On iPhone/iPad (iOS 16.4+), add the
site to Home Screen, launch that icon, sign in, then use the bell in the chat list.
Normal Safari tabs display installation instructions.

## Server configuration

Existing UnifiedPush VAPID keys are reused:

- UNIFIED_PUSH_VAPID_PUBLIC_KEY (or VAPID_PUBLIC_KEY)
- UNIFIED_PUSH_VAPID_PRIVATE_KEY (or VAPID_PRIVATE_KEY)
- UNIFIED_PUSH_VAPID_SUBJECT (or VAPID_SUBJECT), e.g. mailto:push@orderspace.ru

If keys already exist, KEEP THEM. Rotating them invalidates existing subscriptions.
If absent, generate once on the server with:

    npx web-push generate-vapid-keys

Store the private key only in backend environment configuration. Restart backend.
The authenticated /push/web/config endpoint exposes only the public key and
whether the service is configured. Missing configuration is shown in the UI.
Allow outbound HTTPS to Apple/Google/Mozilla push services.

Uses the existing unified_push_subscriptions table with distributorId=web-browser.
Browser subscriptions are delivered independently of Expo/native fallback.
Calls/data-only signals are excluded; this feature covers message notifications.
The worker does not cache authenticated pages or API responses.
Disable/logout unsubscribes this browser without changing other devices.

Serve /webchat-sw.js as JavaScript, without redirects/authentication and preferably
Cache-Control: no-cache. Serve /manifest.webmanifest as application/manifest+json.
Do not apply long immutable CDN caching to either file.

## Acceptance checks on real devices

1. Install from Safari, sign in, tap bell -> enable -> allow.
2. Tap Check: a test notification should appear.
3. Background/close the PWA, lock the phone, send a room/boss/Telegram/MAX message
   from another account. Tap notification: the relevant chat should open.
4. Repeat with a user who has no Android push token, and with multiple devices.
5. Disable notifications and verify no new notifications on this device.
6. Log out, then sign in as another user: old-account notifications must stop.
7. Deny permission: show recovery instructions without repeatedly prompting.

Lock-screen appearance/sound follows the user's iOS notification and Focus settings.
Production delivery must be tested on an actual subscribed device after deployment.
