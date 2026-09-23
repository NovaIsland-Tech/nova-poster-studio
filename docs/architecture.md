# Static frontend and managed member administration

Static HTML/CSS/JS → Supabase Auth/PostgREST/Storage and the configured image provider. There are no runtime Next.js route handlers, middleware, image proxies, daemons, or hosted generation tasks. A Supabase Free Edge Function handles member administration only. Next.js is used only for UI authoring and static export.

## Identity and data

The public Supabase publishable key identifies the project; user access tokens authorize calls. RLS restricts profiles, assets, jobs and storage objects to the appropriate member. Admin permissions are read from the database, not user-editable metadata. Enabled model configurations intentionally include readable API keys for active members. No service-role key or encryption master key is included in static output.

Supabase Postgres functions still perform transactional data operations. This is part of the managed database, not a separately deployed application process. `nova_browser_action` binds user operations to `auth.uid()`, validates current membership, and checks admin role before privileged configuration changes. Legacy service-only billing functions remain inaccessible directly to browsers.

Invitation records contain a hashed random token and exact email. An Auth insert trigger atomically consumes valid invitations and creates member profiles. The `nova-members` Edge Function validates the caller through Auth and a fresh admin profile lookup, then calls Auth Admin APIs with its server-only service-role key. Public signup remains disabled and email confirmation remains enabled. Admin-created members receive 2 credits by default and the initial password `123456`, with a change-or-skip prompt. Changed passwords are not stored in plaintext. Member deletion disables access, removes images and credentials, and preserves anonymized financial history.

## Generation lifecycle

1. Browser decodes JPG/PNG/WebP, checks 10 MB / 25 megapixel limits, normalizes to PNG at max 1800 px, uploads into the member's private Storage folder.
2. UI compiles a structured prompt and submits a stable idempotency key to the database. The transaction reserves credits, checks membership, mode access, daily estimate and one pending job, and snapshots template/model version.
3. Browser atomically claims queued job. Competing tabs can claim it only once. Browser sends the uploaded pixels and model Key directly to the supplier.
4. On success, browser draws background and exact copy into Canvas and uploads the result PNG. If saving fails after rendering, the in-memory result can still be downloaded while the page remains open.
5. Definitive pre-call/4xx failures refund Nova credits once. CORS/network/timeout/5xx and post-generation failures become uncertain, require manual supplier reconciliation, and do not retry automatically.
6. Reload can resume a queued job that was never claimed; a running job is never retried. After six minutes, subsequent reads mark an interrupted running job uncertain. No background timer runs when the website is closed.

Quota enforcement protects the normal app flow, but cannot meter calls made independently with a copied provider key. Browser-reported results cannot prove supplier billing. Use supplier-side spend controls if desired.

## Deployment and tests

`npm run build` outputs `out/` with static pages. `npm start` serves those files locally using Python's static HTTP server, proving no application API is present. Hosting needs only HTTPS static file support. Build inputs are two public Supabase variables; the local secret key is only for maintenance/test scripts.

Unit tests cover prompts, escaping, adapter payloads and error classification. Supabase tests cover RLS, admin privileges, duplicate claims and credit transactions. Browser tests use real temporary Supabase accounts and a mocked provider; they verify Canvas dimensions, upload/download, reload and CORS failures without paid model calls.

Production hosting: Cloudflare Pages at https://nova-poster-studio.pages.dev. `npm run deploy` builds locally and uploads only `out/`; this command does not deploy the separately managed Supabase member function. Supabase auth redirect settings include the exact production callback URLs.
