# Becoming Palimpsest (2025)

**Becoming Palimpsest** is an interactive web installation created by Xiaohan Sun in 2025. It turns text, image, and bodily presence into a layered field of memory.

AI-generated language appears and shifts on screen while the viewer's silhouette is translated into moving visual traces. These traces continually cover, disturb, and reveal what came before, creating a palimpsest-like surface where nothing fully disappears.

## Technical notes

- Body detection and camera processing run locally in the visitor's browser
- Screenshots are downloaded to the visitor's device and are not uploaded
- Dialogue requests use secure server-side endpoints for OpenAI and DeepSeek
- API keys are stored only as deployment environment variables and are never included in this repository

## Running the work

Import this repository into Vercel, then add `OPENAI_API_KEY` and `DEEPSEEK_API_KEY` in the project's environment variables. Optional model settings are documented in `.env.example`.

## More information

Exhibited in:

- *Kairós: Between Choice and Fate*, Batsford Gallery, London, UK, 2025
- *hey, cyborg*, 67 York Street Gallery, London, UK, 2025
- *Goldsmiths MFA Computational Degree Show R.A.W: Request, Activate, Write*, London, UK, 2025

Project page: [xiaohan-sun.com/becoming-palimpsest](https://xiaohan-sun.com/becoming-palimpsest)

## Rights

Copyright © 2025 Xiaohan Sun. All rights reserved.


## Exhibition request protection

The server owns the original Bergson and Deleuze system prompts. Browsers send only user/assistant dialogue; summaries remain conversation context with user priority. Each provider response stays capped at 300 tokens with the original model defaults and temperature. Layout, animation, camera processing, controls, and dialogue timing are unchanged. Client text is still untrusted: a fixed prompt limits role replacement but does not guarantee immunity to prompt injection.

Both endpoints share a quota namespace: 12 requests per IP per fixed minute, 120 requests overall per fixed minute, and 3,000 requests overall per UTC day by default. The overall limits can be changed with the variables in `.env.example`. Each accepted provider attempt consumes one reservation, including upstream failures; denied requests do not consume the daily quota. These are request limits, not a monetary budget. The existing input bounds also remain: 20 messages, 8,000 characters each, 30,000 characters total, and a 50 KB JSON body (checked in bytes, including pre-parsed bodies).

To enable durable, cross-instance protection before publicly advertising an exhibition:

1. Connect an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel's server environment. Use a dedicated database or a unique `RATE_LIMIT_PREFIX`; keep the same prefix across the exhibition's instances and endpoints. Use a different prefix/database for previews.
2. Set `REQUIRE_SHARED_RATE_LIMIT=true` and redeploy. Counters are reserved atomically through Redis. Missing, invalid, timed-out, or unavailable shared storage blocks paid generation with a generic 503 instead of silently bypassing limits.
3. Check a normal dialogue on the deployed site and confirm both providers respond. Test quotas in a separate preview using a low overall limit. Verify excess calls return 429 with `Retry-After`, and broken Redis credentials return 503 without provider requests.
4. Set any available provider-side usage controls and billing alerts separately. Choose daily request limits for the expected exhibition duration and attendance; all viewers on the same public IP share the 12/minute quota.

**Deployment status matters:** leaving both Redis variables empty and `REQUIRE_SHARED_RATE_LIMIT=false` preserves compatibility using bounded, expiring in-memory counters. These counters reset on restarts and are not shared across serverless instances; this mode is not a global spending cap. Adding code to GitHub does not configure Vercel or provider billing settings.

Provider requests time out after 20 seconds; shared-storage requests after 3 seconds. API responses are not cached, and provider errors/credentials are not returned or logged. The additional CSP restricts base URLs, object embeds, and form targets without changing camera permissions or the external libraries used by the artwork.

Camera processing occurs locally in the visitor's browser. Images are not uploaded by the artwork. Dialogue text is sent to the selected AI provider through the server. Display this notice in the exhibition label if needed; no new entry screen or consent interaction is added.

Implementation references: [Upstash REST API](https://upstash.com/docs/redis/features/restapi), [Vercel request headers](https://vercel.com/docs/headers/request-headers). Outside Vercel, rate limiting uses the socket address instead of trusting arbitrary forwarded headers.

Run regression tests with `npm test` (Node.js 20 or newer). Tests mock provider/storage calls and incur no AI usage fees.

## Display scaling

The work fills the browser viewport in portrait, landscape, square and ultrawide displays. Typography, spacing, buttons and character animation distances scale together using the shorter viewport edge relative to 1080 CSS pixels. At 1920 × 1080 the original sizes are retained; at 3840 × 2160 or 2160 × 3840 they render at 2×. OS display scaling can make CSS pixels differ from a monitor's hardware pixels.

The layout adapts to the aspect ratio: portrait screens show narrower, taller dialogue with natural line wrapping, while landscape screens show wider lines. The work has no fixed landscape frame or outer letterboxing. Camera imagery and silhouette coordinates use proportional cover scaling, so the image fills the screen without stretching people (camera edges may be cropped when screen and camera aspect ratios differ).

Moving the browser to another monitor, resizing it, rotating a display or entering fullscreen updates the stage and canvas automatically. It does not restart the camera or dialogue. The silhouette canvas is redrawn at its new dimensions after an aspect-ratio change. For exhibition use, make the browser fullscreen on the target screen.

Local PNG captures use the current portrait/landscape composition, with the longest edge capped at 3840 pixels to avoid excessive capture memory. The layout adjustment only affects display/capture sizing; provider prompts, dialogue timing, fonts, colours and controls remain the same.
