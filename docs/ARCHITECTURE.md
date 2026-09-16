# Architecture

## Recommendation

Use a modular monolith optimized for a 30-day v0.1:

- Next.js App Router, TypeScript, Tailwind CSS.
- PostgreSQL and Prisma.
- Auth.js or similarly mature authentication.
- Docker for local services.
- GitHub Actions for CI.

Avoid microservices for v0.1.

## Repository Baseline

At M0 inspection, the repository contained only:

- `README.md`
- `README.zh-CN.md`

No source code, architecture documents, database schema, CI workflows, GitHub Issues, Pull Requests, milestones, or non-main branches existed.

## Application Layers

- Web layer: Next.js routes, server actions/API routes, and focused UI for staff/manager/owner workflows.
- Service layer: domain services for organizations, branches, memberships, customers, acquisition channels, promotions, claims, redemptions, voids, audit, and analytics.
- Data access layer: Prisma queries wrapped by service functions that always require organization context.
- Shared domain layer: phone normalization, money helpers, promotion calculations, permission checks, validation schemas, and audit action definitions.

## Tenant Isolation

Every tenant-owned table must include `organizationId` directly or through a required parent. Every service method must load resources under organization scope and verify active membership.

Defense-in-depth:

- Required `OrganizationMembership` for organization access.
- Required `BranchMembership` for branch-scoped Staff/Manager work.
- Owner may have organization-wide scope.
- Cross-tenant denial tests for major workflows.
- Consider PostgreSQL Row-Level Security after v0.1 schema stabilizes.

## Authentication

Use Auth.js or equivalent. Session should identify the User only; organization/branch permissions are loaded server-side. Customers never authenticate.

## Authorization

RBAC is explicit:

- STAFF: customer lookup/create, first channel capture, eligible promotions, claim, checkout, Best Deal, redeem.
- MANAGER: Staff plus promotion management, acquisition channel management, branch analytics, void.
- OWNER: organization-wide management, analytics, settings, permissions, audit.

Each mutation checks authenticated user, active membership, role, and branch scope when applicable.

## Promotion Eligibility Engine

Inputs: organization, branch, customer, promotion state, branch targeting, validity window, bill subtotal, prior successful redemption, claim where required, and receipt duplicate status.

v0.1 rewards: fixed amount, percentage with optional max discount, and spend threshold.

Output: eligible/ineligible, reason codes, discount amount, net amount, and Best Deal flag. Best Deal is advisory only.

## Redemption Transaction Handling

Redemption runs in a database transaction:

1. Re-read customer, branch, promotion, claim, receipt state under organization scope.
2. Recalculate eligibility server-side.
3. Insert Redemption protected by unique partial indexes.
4. Write AuditLog.
5. Return success or safe conflict.

Concurrent duplicate attempts must result in one success and one safe failure.

## Analytics

Compute analytics from source records for v0.1. Do not store derived metrics unless performance later requires it. Promotion analytics exclude VOIDED redemptions and use "promotion-linked sales" terminology. Acquisition analytics use original customer channel and remain separate.

## Audit Logging

Audit logs are append-only and tenant-scoped. Capture actor, role, action, entity type/id, organization, branch when relevant, reason, before/after data when practical, and timestamp.

## QR/Public Claim Endpoint

Keep the QR endpoint minimal: phone input, promotion/branch context, validation, rate limits, generic response, no customer profile exposure, no phone-existence leak.

## Error Handling

Validation errors give field feedback. Authorization and not-found responses must not leak cross-tenant existence. Redemption conflicts should clearly indicate already redeemed or receipt already used without exposing unrelated tenant data.

## Deployment Model

Single Next.js app container plus PostgreSQL. GitHub Actions runs lint, typecheck, tests, and build. Migrations run explicitly during deployment.
