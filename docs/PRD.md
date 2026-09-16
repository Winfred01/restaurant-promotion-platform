# Product Requirements Document

## Product Goal

Build a production-oriented v0.1 SaaS platform that lets restaurants create promotions, staff claim and redeem promotions for customers, capture each new customer's original acquisition channel exactly once, and measure sales associated with promotion redemptions.

Target v0.1 flow: restaurant setup -> branch setup -> staff/RBAC -> customer lookup -> new-customer channel capture -> promotion creation -> promotion claim -> checkout -> Best Deal -> redemption -> void -> audit -> analytics -> deployment.

## Users and Personas

- Owner: manages organization-wide branches, employees, permissions, promotions, settings, analytics, and audit history.
- Manager: manages branch operations, promotions, acquisition channels, branch analytics, and voids.
- Staff: searches or creates customers, captures first channel, claims promotions, enters receipt/subtotal, views Best Deal, and redeems.
- Customer: uses phone number only; no account, password, dashboard, app, or coupon wallet.

## Business Problems

- Restaurants cannot reliably measure claims, redemptions, discount cost, and promotion-linked sales.
- Staff need a fast checkout-safe workflow.
- Owners need acquisition channel quality over time without treating every redemption as channel attribution.
- Historical redemptions and voids must remain auditable.

## MVP Scope

- Multi-tenant restaurant organizations with strict tenant isolation.
- Multiple branches per organization.
- OWNER, MANAGER, STAFF RBAC.
- One customer per normalized phone number per organization.
- Acquisition Channel captured once when a customer is first created.
- Bill-level promotion types: fixed amount, percentage, spend threshold.
- Promotion lifecycle: DRAFT, SCHEDULED, ACTIVE, PAUSED, ENDED, ARCHIVED.
- All-branch or selected-branch promotion targeting.
- Shared/manual and generated promotion codes.
- Staff-assisted claims and lightweight public QR claim.
- Eligibility engine and advisory Best Deal.
- Receipt number and bill subtotal capture.
- One promotion per bill.
- One successful redemption per customer per promotion.
- Duplicate receipt protection at branch scope.
- Concurrency-safe redemption.
- Manager/Owner void with audit trail.
- Promotion analytics and separate acquisition analytics.

## Explicit Non-Goals

- Customer login, passwords, dashboard, app, or coupon wallet.
- Full ordering/POS/payment system.
- Card data storage.
- Item/POS/menu-level promotions such as BOGO, dish discount, category discount, second item discount, or free item.
- Loyalty points, membership tiers, SMS/email automation, AI campaigns, or deep POS integration.
- Claims of proven incremental revenue without baseline/control methodology.

## Required Workflows

### Staff

1. Select branch context.
2. Search by phone number.
3. Create customer if missing and capture Acquisition Channel once.
4. View eligible promotions and claims.
5. Claim a promotion if needed.
6. Enter receipt number and bill subtotal at checkout.
7. Review eligible promotions and Best Deal.
8. Select one promotion and confirm redemption.

### Manager

All Staff capabilities plus promotion create/edit/pause/archive, acquisition channel management, branch analytics, and void incorrect redemptions.

### Owner

Organization-wide access for branches, employees, permissions, promotions, settings, analytics, and audit history.

### New Customer

Normalize phone, search within organization, create Customer if missing, require Acquisition Channel, and persist that original channel.

### Returning Customer

Find existing Customer by normalized phone within organization. Do not ask for Acquisition Channel again.

### Promotion Creation

Manager/Owner creates DRAFT, chooses bill-level reward, sets dates/lifecycle/code behavior/branch targeting, then schedules or activates.

### Claim

Staff or QR endpoint submits phone and promotion context. System validates tenant, branch, promotion state, dates, and eligibility. Public QR responses must not reveal whether the phone already exists.

### Redemption

Server rechecks eligibility in a transaction, calculates discount, inserts Redemption, records audit log, and returns a safe conflict if constraints fail.

### Void

Only Manager/Owner may void. Void requires actor, timestamp, reason, original redemption reference, and audit trail. Void never deletes the original record.

## Analytics Requirements

Promotion analytics:

- Claims, redemptions, redemption rate.
- Gross bill amount, total discount, net bill amount, average bill.
- Unique customers and new/returning customer split.
- Exclude VOIDED redemptions.
- Use "Promotion-linked Sales" or "Sales Associated With Promotion Redemptions", not "incremental revenue".

Acquisition analytics:

- New customers acquired, returning customers, return rate.
- Lifetime spend and average spend by original acquisition channel.
- Remain separate from promotion analytics.

## Functional Requirements

- Every tenant-owned read/write is organization-scoped.
- Authorization checks include role and branch/organization membership.
- Promotion codes cannot bypass one-use-per-customer-per-promotion.
- Duplicate active receipts are blocked by `(branchId, normalizedReceiptNumber)`, while VOIDED redemptions preserve history and allow corrected redemption for the same receipt.
- Redemptions are concurrency-safe.
- Historical transactional data is archived/voided, not deleted.

## Non-Functional Requirements

- Type-safe Next.js/TypeScript app.
- PostgreSQL relational integrity with Prisma.
- Docker-based local services.
- Fast CI: install, lint, typecheck, tests, build.
- Input validation, rate limiting, and safe logging.
- No full phone numbers, secrets, tokens, or cookies in logs.

## Acceptance Criteria

v0.1 is accepted when a restaurant can create organization/branches/users, create an active bill-level promotion, create/search customers, capture channel once, claim and redeem one eligible promotion for a receipt, block repeat customer/promotion and duplicate receipt redemptions, safely handle concurrent duplicates, void with Manager/Owner permission, and view separate promotion and acquisition analytics.

## Future v0.2 Ideas

POS integrations, item-level promotions, SMS/email campaigns, loyalty, segmentation, birthday/win-back automation, advanced cohorts, subscription billing, and AI-assisted campaign recommendations.
