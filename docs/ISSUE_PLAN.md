# GitHub Issue Plan

GitHub CLI was unavailable in this environment, so this plan is ready to copy into GitHub. It contains 25 implementation issues.

## Milestone Mapping

- M0 Planning & Foundation: Issues 1-2.
- M1 Tenant & RBAC: Issues 3-7.
- M2 Customer: Issues 8-10.
- M3 Promotion Engine: Issues 11-15.
- M4 Redemption: Issues 16-20.
- M5 Analytics: Issues 21-22.
- M6 QA & Security: Issues 23-24.
- M7 v0.1 Release: Issue 25.

## Issues

### 1. M0: Establish application scaffold and CI baseline

Objective: Create minimal production-oriented Next.js/TypeScript scaffold and CI. Scope: app shell, lint, typecheck, unit test, build, Docker basics, env example. Non-goals: no business flows. Dependencies: M0 planning PR. Notes: keep app page placeholder only. Acceptance: scaffold runs locally and CI exists. Tests: scaffold smoke test.

### 2. M0: Configure database tooling without business migrations

Objective: Prepare Prisma/PostgreSQL tooling. Scope: datasource/generator, commands, documentation. Non-goals: no business tables. Dependencies: Issue 1. Notes: use `.env.example` DATABASE_URL. Acceptance: Prisma tooling ready. Tests: command smoke check where dependencies exist.

### 3. M1: Implement organization and branch schema

Objective: Add tenant root and branch persistence. Scope: RestaurantOrganization, Branch, status/archive fields, indexes. Non-goals: no UI. Dependencies: Issues 1-2. Notes: branch belongs to organization. Acceptance: organization-scoped branch reads. Tests: constraints and tenant scope.

### 4. M1: Add authentication baseline

Objective: Establish employee auth. Scope: Auth.js or equivalent, User, sessions, protected helper. Non-goals: no customer auth. Dependencies: Issue 3. Notes: server-side permission loading. Acceptance: protected requests require auth. Tests: auth guard/session tests.

### 5. M1: Implement organization and branch memberships

Objective: Represent employee access. Scope: OrganizationMembership, BranchMembership, OWNER/MANAGER/STAFF, active/disabled status. Non-goals: full employee UI. Dependencies: Issue 4. Acceptance: role assignment and disabled access denial. Tests: uniqueness and status.

### 6. M1: Implement RBAC authorization guards

Objective: Centralize permission checks. Scope: permission matrix and guard helpers. Non-goals: feature logic. Dependencies: Issue 5. Acceptance: role capabilities match PRD. Tests: role allow/deny matrix.

### 7. M1: Add tenant isolation test harness

Objective: Make cross-tenant tests easy. Scope: factories for tenants, branches, users, memberships, scoped requests. Non-goals: features. Dependencies: Issue 6. Acceptance: harness proves tenant A cannot access tenant B. Tests: cross-tenant denial.

### 8. M2: Implement customer phone normalization and lookup

Objective: Search customers by normalized phone within organization. Scope: Customer model, normalization helper, lookup service. Non-goals: analytics. Dependencies: Issue 7. Acceptance: same phone allowed across tenants, not duplicated within tenant. Tests: normalization, uniqueness, cross-tenant denial.

### 9. M2: Implement customer creation and one-time acquisition channel capture

Objective: Create customers and capture original channel exactly once. Scope: AcquisitionChannel, defaults, creation service. Non-goals: per-redemption channel attribution. Dependencies: Issue 8. Acceptance: new customer requires channel, returning customer keeps original channel. Tests: first-capture and no-repeat prompt.

### 10. M2: Add staff customer workflow endpoints

Objective: Expose Staff-safe lookup/create operations. Scope: authenticated endpoints/server actions. Non-goals: promotion or redemption. Dependencies: Issue 9. Acceptance: authorized Staff can lookup/create; unauthorized denied. Tests: endpoint validation and RBAC.

### 11. M3: Implement promotion schema and lifecycle

Objective: Add bill-level promotion persistence. Scope: Promotion, PromotionBranch, PromotionCode, lifecycle states. Non-goals: item-level promotions. Dependencies: Issue 7. Acceptance: all-branch or selected-branch targeting. Tests: constraints, targeting, lifecycle.

### 12. M3: Implement Manager/Owner promotion management services

Objective: Let authorized roles manage promotions. Scope: create/edit/pause/archive, validation, audit. Non-goals: redemption. Dependencies: Issue 11. Acceptance: Manager/Owner allowed, Staff denied. Tests: RBAC, validation, archive/delete behavior.

### 13. M3: Implement promotion code generation and validation

Objective: Support manual/shared and generated codes. Scope: PromotionCode behavior and uniqueness. Non-goals: code-based one-use enforcement. Dependencies: Issue 11. Acceptance: code changes do not reset customer eligibility. Tests: code uniqueness and one-use independence.

### 14. M3: Implement promotion eligibility engine

Objective: Calculate eligible promotions and savings. Scope: fixed amount, percentage, spend threshold, dates, lifecycle, branch targeting, prior redemption checks. Non-goals: BOGO/dish/category logic. Dependencies: Issues 8, 11, 13. Acceptance: results include discount/final cents and reason codes. Tests: calculations and boundaries.

### 15. M3: Implement Best Deal selection

Objective: Mark highest immediate savings. Scope: deterministic helper over eligibility results. Non-goals: auto redemption. Dependencies: Issue 14. Acceptance: advisory only. Tests: best savings, tie, ineligible exclusion.

### 16. M4: Implement customer promotion claim

Objective: Allow staff-assisted claims. Scope: CustomerPromotionClaim model and service. Non-goals: public QR. Dependencies: Issues 10, 14. Acceptance: Staff can claim eligible promotion; duplicate active claim handled safely. Tests: authorization, eligibility, duplicate claim.

### 17. M4: Implement checkout redemption transaction

Objective: Redeem one promotion for a bill. Scope: Redemption, server-side eligibility recheck, receipt/subtotal, audit. Non-goals: void. Dependencies: Issues 14-16. Acceptance: redemption stores customer, branch, receipt, subtotal, discount, net, actor. Tests: success, unauthorized, validation.

### 18. M4: Enforce duplicate receipt and one-use constraints

Objective: Protect core redemption invariants. Scope: partial unique indexes and conflict handling. Non-goals: analytics. Dependencies: Issue 17. Acceptance: duplicate customer/promotion and receipt are blocked. Tests: duplicates and cross-branch receipt scope.

### 19. M4: Add concurrent redemption protection test

Objective: Prove simultaneous duplicates fail safely. Scope: integration test with two competing redemptions. Non-goals: load testing. Dependencies: Issue 18. Acceptance: one success and one safe conflict. Tests: concurrent duplicate redemption.

### 20. M4: Implement Manager/Owner void redemption

Objective: Void without deleting history. Scope: RedemptionVoid, status update, reason, audit. Non-goals: Staff void. Dependencies: Issue 18. Acceptance: Manager/Owner can void, Staff cannot, original remains. Tests: permission, reason, audit, no-delete.

### 21. M5: Implement promotion analytics

Objective: Report promotion-linked sales and redemption metrics. Scope: claims, redemptions, rate, gross, discount, net, average bill, unique customers. Non-goals: incremental revenue claim. Dependencies: Issue 20. Acceptance: VOIDED excluded and terminology approved. Tests: aggregation with voids.

### 22. M5: Implement acquisition channel analytics

Objective: Report new-customer and return metrics by original channel. Scope: new customers, return rate, lifetime spend, average spend. Non-goals: per-redemption channel attribution. Dependencies: Issues 9, 20. Acceptance: separate from promotion analytics. Tests: channel grouping and void handling.

### 23. M6: Add public QR claim endpoint with abuse protections

Objective: Support lightweight customer claim without accounts. Scope: public endpoint/page, phone input, generic response, rate limits. Non-goals: customer dashboard/wallet. Dependencies: Issues 14, 16. Acceptance: claim by phone, no enumeration, abuse protections. Tests: validation, rate limit, generic response.

### 24. M6: Complete E2E and security review

Objective: Verify critical loop and security boundaries. Scope: E2E, IDOR/RBAC review, QR abuse, logging review. Non-goals: new features. Dependencies: Issues 1-23. Acceptance: critical path passes; high-risk findings fixed or tracked. Tests: full happy path and security denial paths.

### 25. M7: Deploy v0.1 release candidate

Objective: Prepare and verify production deployment. Scope: deployment config, environment docs, migration process, smoke test, release checklist. Non-goals: feature expansion. Dependencies: Issue 24. Acceptance: deployed release candidate passes smoke test and CI. Tests: CI, build, migration dry run, smoke test.
