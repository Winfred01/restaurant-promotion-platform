# Agent Instructions

This repository is the Restaurant Promotion & Revenue Growth Platform.

## Required Context Before Work

Before making changes, coding agents must:

1. Read `README.md`.
2. Read `docs/PRD.md`.
3. Read `docs/ARCHITECTURE.md`.
4. Read the relevant GitHub Issue.
5. Fetch `origin/main`.
6. Inspect existing Pull Requests.
7. Confirm current branch and repository status.

## Workflow Rules

- Work on exactly one issue at a time.
- Use one branch per issue.
- Do not start the next issue until the previous issue is merged.
- Avoid unrelated refactors.
- Do not auto-merge.
- Do not force-push unless explicitly authorized.
- Do not commit secrets.
- Run validation before opening a PR.
- Keep PRs focused and reviewable.

## Product Rules That Must Be Preserved

- The platform is multi-tenant.
- Strict tenant isolation is mandatory.
- Preserve OWNER, MANAGER, and STAFF RBAC.
- Customers do not need accounts or passwords.
- Customer identity is phone number.
- Acquisition Channel is captured exactly once when a customer is first created.
- Returning customers must not be asked for Acquisition Channel again.
- Promotion types in v0.1 are bill-level: fixed amount, percentage, spend threshold.
- One customer may successfully redeem the same Promotion only once.
- Promotion code changes must not bypass one-use-per-customer-per-promotion.
- One bill can use only one Promotion.
- Same receipt must not be redeemed twice within the chosen restaurant/branch scope.
- Redemption must be concurrency-safe.
- Void is not delete.
- Never delete redemptions to implement void.
- Preserve audit history.
- Exclude VOIDED redemptions from revenue calculations.
- Do not call promotion-linked sales "incremental revenue" unless a baseline/control methodology exists.
- Keep Acquisition Channel analytics separate from Promotion analytics.

## Code Quality Rules

- Prefer TypeScript for application code.
- Keep domain logic in testable service modules.
- Keep UI components thin and workflow-focused.
- Validate all API inputs.
- Use integer cents for money.
- Normalize phone numbers before lookup or persistence.
- Enforce core invariants with database constraints where possible.
- Avoid raw SQL unless required; parameterize and review any raw query.
- Do not log full phone numbers, secrets, tokens, or cookies.

## Testing Rules

Add tests for business rules, especially:

- Tenant isolation.
- RBAC permissions.
- New customer channel capture exactly once.
- Returning customer channel prompt suppression.
- Promotion eligibility.
- Best Deal calculation.
- One-use-per-customer-per-promotion.
- One-promotion-per-bill.
- Duplicate receipt blocking.
- Concurrent redemption conflict.
- Void permission and audit behavior.
- Analytics excluding VOIDED redemptions.

Before opening a PR, run the available validation commands:

- lint
- typecheck
- unit tests
- build

If a command cannot be run locally, document why in the PR.
