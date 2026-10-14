# Database Design

## Principles

- PostgreSQL is the source of truth. Use Prisma `6.12.0` through v0.1 unless a concrete security or compatibility problem requires changing it.
- Monetary values use integer cents.
- Tenant-owned records are organization-scoped.
- Normalized phone numbers are used for customer uniqueness and lookup.
- Critical invariants are enforced with database constraints plus service checks.
- Do not store derived analytics unless justified later.
- Void/archive instead of deleting transactional history.

## Core Entities

### RestaurantOrganization

Tenant root. Fields: `id`, `name`, `slug`, `timezone`, `currency`, `status`, timestamps. Unique `slug`. Archive/disable instead of deleting once history exists.

### Branch

Physical or operational branch. Fields: `id`, `organizationId`, `name`, `address`, `timezone`, `status`, timestamps. Index `(organizationId, status)`. Optional unique `(organizationId, name)`.

### User

Authenticated employee identity. Fields: `id`, `email`, `name`, `passwordHash` if password auth is used, `status`, timestamps. Unique normalized `email`. Tenant access comes through memberships.

### OrganizationMembership

Grants organization-level role. Fields: `id`, `organizationId`, `userId`, `role`, `status`, timestamps. Unique `(organizationId, userId)`. Roles: OWNER, MANAGER, STAFF.

### BranchMembership

Grants branch-level access. Fields: `id`, `organizationId`, `branchId`, `userId`, `role`, `status`. Unique `(branchId, userId)`. Branch and organization must match.

### Customer

Restaurant-owned customer profile. Fields: `id`, `organizationId`, `phoneNumberRaw`, `phoneNumberNormalized`, `phoneNumberDisplay`, `acquisitionChannelId`, `firstSeenAt`, `lastSeenAt`, `marketingConsent`, `status`, timestamps.

Constraints:

- Unique `(organizationId, phoneNumberNormalized)`.
- Index `(organizationId, acquisitionChannelId)`.
- Do not delete when claims/redemptions exist.

### AcquisitionChannel

Organization-managed channel list. Fields: `id`, `organizationId`, `name`, `isSystemDefault`, `status`, `sortOrder`. Unique `(organizationId, name)`. Archive when referenced.

### Promotion

Promotion definition and lifecycle. Fields: `id`, `organizationId`, `name`, `description`, `status`, `rewardType`, `discountCents`, `discountPercent`, `maxDiscountCents`, `minimumSpendCents`, `validFrom`, `validUntil`, `appliesToAllBranches`, `createdByUserId`, timestamps.

Indexes:

- `(organizationId, status, validFrom, validUntil)`.
- `(organizationId, rewardType)`.

Only hard delete when no claims, codes, or redemptions exist.

### PromotionBranch

Selected-branch targeting. Fields: `id`, `organizationId`, `promotionId`, `branchId`. Unique `(promotionId, branchId)`. Promotion and branch must share organization.

### PromotionCode

Shared or unique code. Fields: `id`, `organizationId`, `promotionId`, `code`, `codeType`, `status`, timestamps. Unique `(organizationId, code)`. Code changes must not reset customer redemption eligibility.

### CustomerPromotionClaim

Pre-redemption claim. Fields: `id`, `organizationId`, `branchId`, `customerId`, `promotionId`, `promotionCodeId`, `claimedByUserId`, `source`, `status`, `claimedAt`.

Indexes:

- Active claim uniqueness where needed: `(customerId, promotionId)` for CLAIMED.
- `(organizationId, customerId, status)`.
- `(organizationId, promotionId, status)`.

The active-claim uniqueness is a PostgreSQL partial unique index on
`(organizationId, customerId, promotionId)` where `status = CLAIMED`. Claim rows are retained when
their status changes; all claim foreign keys use organization-scoped relationships with `RESTRICT`
deletion. The staff-assisted service sets source `STAFF` and writes an audit record in the same
transaction. Bill subtotal and spend-threshold checks occur again at checkout.

### Redemption

Permanent bill-level redemption record. Fields: `id`, `organizationId`, `branchId`, `customerId`, `promotionId`, `promotionCodeId`, `claimId`, `redeemedByUserId`, `receiptNumber`, `billSubtotalCents`, `discountCents`, `netBillCents`, `status`, `redeemedAt`, `voidedAt`.

The eligibility stage initially persisted only the tenant-safe identity, optional Promotion Code,
status, and redemption timestamp needed to read prior successful use. The eligibility service
does not create or mutate these rows.

Checkout redemption now records an optional same-tenant, same-branch customer/promotion claim,
the employee actor, entered and normalized receipt number, bill subtotal, discount, and net bill
amount in integer cents. Existing eligibility-history rows retain nullable checkout fields; the
checkout service always writes them. It rechecks branch permission and eligibility within a
serializable transaction, consumes a supplied active claim, and appends an audit record. The
database partial unique indexes for completed customer/promotion and active branch receipt are
created by the Issue #18 migration. They cover only `COMPLETED` rows: one per
`(organizationId, customerId, promotionId)`, and one per
`(organizationId, branchId, normalizedReceiptNumber)` when the normalized receipt is present.
`VOIDED` rows remain in history and do not block corrected redemption. Existing eligibility-history
rows with a null receipt remain valid. Prisma schema cannot represent these partial indexes in
version `6.12.0`, so keep the migration indexes when changing the model.

Constraints:

- Unique partial `(customerId, promotionId)` where `status = COMPLETED`.
- Unique partial `(branchId, normalizedReceiptNumber)` where `status = COMPLETED`.
- Index `(organizationId, promotionId, status, redeemedAt)`.

Receipt uniqueness is branch-scoped: `(branchId, normalizedReceiptNumber)` identifies one active redemption context. Different branches may reuse the same receipt number. VOIDED redemptions preserve history and must allow a corrected redemption for the same receipt without deleting the old record.

### RedemptionVoid

Append-only void details. Fields: `id`, `organizationId`, `redemptionId`, `voidedByUserId`, `reason`, `createdAt`. Unique `(redemptionId)`.

### AuditLog

Append-only sensitive action log. Fields: `id`, `organizationId`, `branchId`, `actorUserId`, `actorRole`, `action`, `entityType`, `entityId`, `reason`, `beforeJson`, `afterJson`, `metadataJson`, `createdAt`.

Indexes:

- `(organizationId, createdAt)`.
- `(organizationId, entityType, entityId)`.
- `(actorUserId, createdAt)`.

## Concurrency Protection

Use transaction-time eligibility recheck plus database unique partial indexes. Duplicate simultaneous redemptions should produce one commit and one safe conflict.

## Derived Metrics

Do not store totals such as lifetime spend, redemption rate, net revenue, or return rate in v0.1. Compute from source records excluding VOIDED redemptions.
