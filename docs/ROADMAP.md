# Roadmap

Development start assumption: September 15, 2026. Target: approximately 30 days. The critical business loop should be functional before the final week.

## M0 - Planning & Foundation

Target: September 15-17, 2026.

Deliver: PRD, architecture, database plan, security plan, issue plan, minimal scaffold, CI baseline.

Exit: Planning PR merged and Issue 1 ready. No business feature implementation started.

## M1 - Tenant & RBAC

Target: September 18-22, 2026.

Deliver: app foundation, auth baseline, organization/branch model, memberships, role checks, tenant tests.

Exit: active memberships and server-side RBAC guards exist; cross-tenant access is denied in tests.

## M2 - Customer

Target: September 23-25, 2026.

Deliver: phone lookup, customer creation, Acquisition Channel captured exactly once, returning customer flow skips channel prompt.

Exit: one customer per normalized phone per organization and channel source data exists.

## M3 - Promotion Engine

Target: September 26-30, 2026.

Deliver: promotion model, branch targeting, lifecycle, fixed/percentage/spend-threshold rewards, eligibility engine, Best Deal.

Exit: Manager/Owner can create active bill-level promotions and eligibility returns savings/reason codes.

## M4 - Redemption

Target: October 1-5, 2026.

Deliver: staff claims, checkout redemption, duplicate protection, concurrency protection, void, audit.

Exit: one bill uses one promotion, same customer cannot redeem same promotion twice, duplicate receipts are blocked, and concurrent duplicates produce one success and one safe failure.

## M5 - Analytics

Target: October 6-8, 2026.

Deliver: promotion analytics and acquisition analytics.

Exit: VOIDED redemptions excluded; approved "promotion-linked sales" terminology used; acquisition analytics separate.

## M6 - QA & Security

Target: October 9-11, 2026.

Deliver: E2E critical flow, IDOR/RBAC/QR/logging review, usability pass for staff workflow.

Exit: critical business loop passes and high-risk security paths have tests.

## M7 - v0.1 Release

Target: October 12-14, 2026.

Deliver: production deployment, environment docs, migration process, release checklist, smoke test.

Exit: CI passing and deployed release candidate verified.

## Milestone Mapping

If GitHub milestone creation is available, create:

- M0 Planning & Foundation
- M1 Tenant & RBAC
- M2 Customer
- M3 Promotion Engine
- M4 Redemption
- M5 Analytics
- M6 QA & Security
- M7 v0.1 Release

If permissions are unavailable, this document is the milestone mapping source.
