# Security

## Goals

- Preserve tenant isolation.
- Prevent IDOR and role bypass.
- Protect customer phone numbers and restaurant financial data.
- Keep QR claim abuse-resistant.
- Preserve audit history.
- Never store card data.

## Tenant Isolation Threats

Risks include missing `organizationId` filters, cross-tenant IDOR, analytics leakage, branch-scope bypass, and public QR phone enumeration.

Controls:

- Server-side organization and branch membership checks.
- Query helpers that require organization context.
- Cross-tenant denial tests.
- Generic public responses.
- Future evaluation of PostgreSQL Row-Level Security.

## RBAC

STAFF can search/create customers, capture first channel, view eligible promotions, claim, checkout, view Best Deal, and redeem. MANAGER can also manage promotions/channels, view branch analytics, and void. OWNER has organization-wide management, analytics, settings, and audit access.

## Authentication and Sessions

Use Auth.js with email/password credentials for employees in v0.1. Do not add OAuth providers in v0.1. Use secure HTTP-only cookies, CSRF protection for cookie-backed mutations, production-appropriate password hashing, and minimal session payloads. Customers never authenticate.

## Public QR Claim Abuse

Rate-limit by IP, promotion, branch, and phone hash. Do not reveal whether a phone exists. Do not expose customer profiles or staff-only promotion data.

The public claim route accepts same-origin, size-limited JSON and returns one 202 message for every
well-formed phone/context request, including unknown customers, duplicate or ineligible claims,
and exhausted limits. PostgreSQL counters enforce per-minute IP/branch/promotion and hourly phone
limits across instances. Counter keys use HMAC-SHA-256 with `AUTH_SECRET`, not raw IPs or phones.
Only the trusted Vercel forwarded-address header is read; absent it, all visitors share a strict
`unknown` address bucket. An anonymous claim and audit row have null actor fields and `QR` source;
database checks prevent Staff claims without an employee actor and anonymous non-QR audit rows.
Run the operator-only counter-prune command daily. Never expose it as an HTTP route.

## Phone Enumeration

Authenticated staff lookup may reveal customer records only within authorized organization/branch. Public QR claim must use generic messages.

## Rate Limits

Public QR claims have shared PostgreSQL limits. Auth attempts, authenticated customer lookup, checkout, and void do not yet have application-level shared throttles. These paths must be protected and verified at the trusted deployment gateway before public release; see the M6 review below.

## Audit Logging

Audit organization/branch changes, membership and role changes, promotion changes, customer creation and channel set, claim creation, redemption, void, and future analytics export.

## Secrets

Never commit secrets. Use `.env.example` only for placeholders. Production secrets live in the deployment provider. CI must not echo secrets.

## Input Validation

Validate phone numbers, receipt numbers, monetary cents, promotion dates/rewards, roles/statuses, and void reasons.

## SQL/ORM Safety

Use Prisma query APIs by default. Raw SQL must be parameterized and reviewed. Critical uniqueness rules belong in database constraints.

## CSRF/XSS

Use CSRF protections for cookie-authenticated mutations, escape user content, validate promotion text, avoid untrusted HTML, and set secure headers in production.

## Privacy and Logging

Mask phone numbers where full display is not required. Logs may include request id, actor id, organization id, entity ids, and action. Logs must not include full phone numbers, passwords, tokens, cookies, or secrets.

## Backups

Back up PostgreSQL regularly, test restore procedures, protect backups with encryption/access controls, and verify restored data preserves tenant isolation and audit history.

## Future Security Work

RLS evaluation, dependency scanning, IDOR-focused review, public endpoint abuse testing, privacy/data retention policy, data export/deletion process, and tamper-evident audit enhancements.

## M6 E2E and security review (2026-11-08)

CI now runs Chromium against the built application and a migrated PostgreSQL demo database. The browser suite covers seeded Owner/Manager/Staff workflows, one-time channel capture, promotion selection and Best Deal, duplicate receipt denial, void and analytics refresh, Staff privilege denial, two isolated guided visitors, mobile checkout, public QR generic responses, session cookie flags, production seed denial, absent seed/reset HTTP routes, and response headers. Unit and PostgreSQL integration tests remain separate gates. The browser suite requires a fresh dedicated demo database and two unclaimed demo pool tenants; it does not reuse or reset visitor data. The review also fixed employee login feedback: Auth.js can return an error with an HTTP-success result, so the login form now checks both fields and gives the same message for unknown accounts and incorrect passwords.

The review found these **release blockers for Issue #25**:

| Finding                                                                                                                                           | Required release gate                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee credential attempts have no shared application throttle.                                                                                 | Configure and verify gateway limits for `/api/auth/*` by source address and account before enabling public demo entry or production employee login. Never expose raw account identifiers in limit keys or logs. |
| Authenticated customer lookup, checkout, and void have no shared application throttle.                                                            | Configure and verify gateway limits for `/api/staff/*` and server actions, or add tested shared application limits before public deployment. Preserve authorized Staff throughput and generic error handling.   |
| The public claim address bucket uses Vercel's trusted forwarded header only when `VERCEL=1`; other hosts share the conservative `unknown` bucket. | Verify the deployment proxy and client-address behavior, then run abuse tests from distinct sources. Schedule the operator-only counter-prune command daily.                                                    |

The app now sends `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and a restrictive browser-permission policy. Auth.js session cookies were observed as HTTP-only and SameSite=Lax in the local HTTP browser test; verify the Secure flag over the final HTTPS URL in Issue #25. The browser test cannot prove deployed gateway controls, TLS, backups, or production logging configuration. A code search found no application logging of full phone numbers, tokens, or cookies in the reviewed request paths; deployment logs still require a live privacy review.

The 2026-11-08 audit found zero production dependency vulnerabilities and seven existing moderate findings in the development-only `typescript-eslint`/`minimatch` chain. No critical or high dependency finding was present.

## Dependency advisory status (2026-11-05)

Issue #62 updates Next.js to `16.4.5`, Zod to `4.6.7`, and Vitest to `5.1.0` (with Vite `8.3.6`). The current `npm audit --omit=dev` reports zero vulnerabilities. The full audit still reports seven moderate findings, all through the development-only `typescript-eslint` dependency chain and `minimatch@10.2.6` (`GHSA-g3hv-75wg-m249`). The advisory requires an attacker-controlled glob pattern with `optimizationLevel >= 2`; this project does not expose lint configuration to web users. Keep this residual finding visible in full audits and update the lint dependency chain when a compatible patched release is available. Do not treat the development-only finding as a production dependency or suppress it from audit output.
