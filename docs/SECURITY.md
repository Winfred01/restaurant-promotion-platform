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

## Phone Enumeration

Authenticated staff lookup may reveal customer records only within authorized organization/branch. Public QR claim must use generic messages.

## Rate Limits

Apply to auth attempts, customer lookup, public QR claim, redemption creation, and void attempts. Public endpoints get stricter limits.

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
