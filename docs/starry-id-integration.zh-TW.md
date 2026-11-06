# Clock / Starry ID integration acceptance

## Authoritative upstream
- Starry ID docs: https://github.com/starry-phd/id/blob/main/docs/integration-guide.md sections 1-4,7,9,10,11.2,11.3.
- OpenAPI 3.1 source: https://github.com/starry-phd/id/blob/main/openapi/starry-id.v1.json.
- Snapshot in contracts/starry-id.v1.json; pnpm codegen:starry uses openapi-typescript to generate component and path types.
- .gitleaks.toml copied from Starry ID, including the sbk_ service-key pattern. PR CI scans commits.

## Registry and callbacks
- app_id clock; iOS and Android phd.starry.clock; registered web origin https://clock.starry.phd.
- Native callbacks clock://auth/apple and clock://auth/google; Expo app scheme clock.
- Web callback https://clock.starry.phd/auth/done.
- Read GET /v1/apps/clock/config and require status active; version below min_version cannot use member functions. Offline timer remains available.

## Relay authentication
- No AppleAuthentication nor Google Sign-In native SDK.
- POST /v1/auth/nonce, hash the original nonce using SHA-256 lowercase hex, create an independent cryptographically random state.
- Navigate to https://id.starry.phd/auth/{provider}/start with registered return, app_id clock, hashed nonce and state.
- Native iOS/Android use expo-web-browser openAuthSessionAsync. Web does a full-page redirect.
- Validate the exact callback and state, remove the web hash token from URL history immediately, and exchange id_token plus raw nonce for Starry tokens.
- Apple code exchange includes authorization_code and the Starry Apple callback URL.
- Native token persistence uses expo-secure-store. Web access token is memory-only; refresh token goes in sessionStorage, never localStorage.
- Refresh is serialized; rotated refresh token overwrites the old token, including any 401 retry. REFRESH_REUSED clears credentials.
- Starry user_id is the only identity key. Never merge using name/email.

## Account lifecycle
- The Clock settings page contains Starry sign-in, consent with terms/privacy links, profile name with If-Match, link identities, logout, logout-all, deletion and undo deletion.
- Deletion warns about the seven-day withdrawal period and subscriptions.
- The central account web center handles complete avatar and other advanced profile fields; Clock does not clone the member database.
- IDENTITY_IN_USE account merging is not automatic; it must be separately reviewed and consented.
- RevenueCat is disabled, and no billing or push registration is used.

## Web Worker and release gates
- Build the PWA Worker with python3 tools/build_worker.py. Generated web-preview/cloudflare-worker.mjs is ignored and regenerated for tests/deploy.
- Generated CSP permits Starry ID HTTPS fetch, and the Worker serves the /auth/done callback with no-store cache headers.
- Production clock.starry.phd has NOT been redeployed from this PR. A staged verification and approved release remain required.
- Existing published iOS IPA uses the previous clockstarry scheme. A NEW EAS native build is required to activate the new clock:// callbacks.
- Do not submit to App Store, Google Play or release existing production resources without owner approval.

## Optional backend Battery
- Clock has no AI task currently. Its clock-api backend skeleton is not deployed and consumes no Battery.
- Backend validates ES256 JWKS with issuer starry-id:production, audience starry, app_id clock, and exp.
- For future AI: reserve clock.ai using STARRY_BATTERY_KEY in the Worker Secret, execute AI only after successful reservation, commit upon success or release on failure.
- Battery fails closed if Starry ID is unavailable. Default units up to 30 until owner adjusts task limits.
- New Cloudflare clock-api staging/production Workers, service key, paid AI vendor, and quotas require owner approval before provisioning.
- Do not modify Starry ID source, settings, databases or secrets.
