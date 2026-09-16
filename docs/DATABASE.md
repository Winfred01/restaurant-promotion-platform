# Database Design

## Principles

- PostgreSQL is the source of truth.
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

### Redemption

Permanent bill-level redemption record. Fields: `id`, `organizationId`, `branchId`, `customerId`, `promotionId`, `promotionCodeId`, `claimId`, `redeemedByUserId`, `receiptNumber`, `billSubtotalCents`, `discountCents`, `netBillCents`, `status`, `redeemedAt`, `voidedAt`.

Constraints:

- Unique partial `(customerId, promotionId)` where `status = COMPLETED`.
- Unique partial `(organizationId, branchId, receiptNumber)` where `status = COMPLETED`.
- Index `(organizationId, promotionId, status, redeemedAt)`.

Default receipt scope is branch-level unless owner confirms organization-wide receipt uniqueness.

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
