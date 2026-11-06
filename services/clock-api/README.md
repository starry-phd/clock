# Clock optional API Worker

This backend is **not deployed**. The Worker has no active Battery-charging endpoint yet. Battery is a monthly consumption quota for approved AI **and non-AI** services; normal timer start/pause/reset stays free.

- Code location: `services/clock-api/src/index.mjs`.
- Worker names: `clock-api-staging` before `clock-api` production.
- Only the health route is active; all AI routes return 404.
- Future backend validates ES256 via `https://id.starry.phd/.well-known/jwks.json`, with production `iss=starry-id:production`, `aud=starry`, and `app_id=clock`.
- 繁星電池艙 Starry Battery：會員共用的消費用量月額度（2026-11-07 最新定義），**不是 AI 專用**。
- `clock.ai` is the currently registered AI task; `clock.preset.create` is a distinct **non-AI** feature that must be registered in Admin Lite before use. Normal timer actions remain free.
- For approved AI or non-AI service: reserve before delivery, commit only after successful service execution, release on failure/cancel/expiry; if Starry ID is offline no charged task can begin. Validate that the actual reservation amount equals the upfront displayed owner price X for `clock.preset.create`.
- Service secret is named `STARRY_BATTERY_KEY` and must be stored only in the Worker Secret, never the App, GitHub, or logs.
- Creating or deploying workers may consume quotas / incur costs, so requires explicit owner approval before staging and production deployments.
- Starry Battery cannot be purchased; future external AI provider costs require owner approval. Do not deploy an empty charge-enabled service.
- New pricing or feature gates must be implemented equally in `apps/clock/` and `web-preview/` in the **same PR**, and backed by server-authoritative member accounting.

No Starry ID code, config, database, or account is modified.
