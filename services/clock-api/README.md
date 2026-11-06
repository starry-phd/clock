# Clock optional API Worker

This backend is **not deployed**. No AI feature exists in Clock now; Battery must not be consumed for normal timers.

- Code location: `services/clock-api/src/index.mjs`.
- Worker names: `clock-api-staging` before `clock-api` production.
- Only the health route is active; all AI routes return 404.
- Future backend validates ES256 via `https://id.starry.phd/.well-known/jwks.json`, with production `iss=starry-id:production`, `aud=starry`, and `app_id=clock`.
- Battery task `clock.ai`: reserve before executing real AI, commit when successful, release upon failure, no AI work if Starry ID is offline; up to 30 units until owner updates task limits.
- Service secret is named `STARRY_BATTERY_KEY` and must be stored only in the Worker Secret, never the App, GitHub, or logs.
- Creating or deploying workers may consume quotas / incur costs, so requires explicit owner approval before staging and production deployments.
- Future paid AI provider and estimated cost require owner approval; do not deploy an empty paid service.

No Starry ID code, config, database, or account is modified.
