English | [简体中文](README.zh-CN.md)

# Restaurant Promotion & Revenue Growth Platform

A multi-tenant SaaS platform for restaurants to create promotions, manage coupon redemption, capture new-customer acquisition sources, and measure how promotions contribute to revenue.

## Employee demo login

The app has an employee login at `/login`. To create a separate, disposable demo tenant with
Owner, Manager, and Staff accounts, first provision a PostgreSQL database whose name includes
`demo`. Apply migrations, then run the seed once. The seed refuses production mode, requires an
explicit database-name confirmation, and stops without changes if its organization or account
emails already exist. It creates only fictional customer data and never writes the password to the repo.

In PowerShell, set runtime values for your dedicated demo database:

```powershell
$env:DATABASE_URL = "postgresql://localhost:5432/restaurant_promotion_demo?schema=public"
$env:DEMO_SEED_DATABASE = "restaurant_promotion_demo"
$env:DEMO_SEED_CONFIRM = "restaurant-demo"
$env:DEMO_SEED_PASSWORD = [System.Net.NetworkCredential]::new("", (Read-Host "Demo password" -AsSecureString)).Password
npm.cmd run prisma:migrate:deploy
npm.cmd run seed:demo
$env:AUTH_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:AUTH_URL = "http://localhost:3000"
$env:DEMO_LOGIN_ENABLED = "1"
npm.cmd run dev
```

Choose a password of at least 16 characters. Use a dedicated database credential in
`DATABASE_URL` if required; keep it in the runtime environment, never in a committed file.
`DEMO_LOGIN_ENABLED=1` displays the demo account names on the login page; it does not create
accounts or bypass authentication. The three email addresses are:

| Role | Email | Access |
| --- | --- | --- |
| Owner | `owner@restaurant-demo.example.com` | Restaurant-wide Owner membership |
| Manager | `manager@restaurant-demo.example.com` | Manager membership at Downtown Demo branch |
| Staff | `staff@restaurant-demo.example.com` | Staff membership at Downtown Demo and Riverside Demo branches |

All three use the password supplied at seed time. After sign-in, `/app` lists the branches available
to the employee and opens an authenticated workspace with role-aware navigation and sign-out.
`/demo` offers isolated guided role entry when configured as described below. Staff, Manager, and Owner can open the Staff checkout page from a
branch workspace. It looks up customers, captures an acquisition channel only for new customers,
compares eligible promotions with an advisory Best Deal, and confirms one redemption against the
live checkout service. Customers have no login.

The seed runs in one transaction and creates two branches, three original acquisition channels,
four customers using fictional reserved `416-555-01xx` numbers, five promotions (active, paused,
scheduled, and ended), five claims, three completed redemptions, one voided redemption with its
reason, plus audit records for the seed, redemptions, and void. The Downtown-only percentage offer
demonstrates branch targeting.
Historical amounts are synthetic CAD cents and are labeled **promotion-linked sales**, not
incremental revenue. VOIDED history remains visible but is excluded from sales and recorded-spend
totals. The returning referral customer has two completed bills; a social-media customer has an
active claim ready for checkout. Seeded customer numbers are demonstration fixtures, never real PII.

Recommended visitor walkthrough: sign in as Owner to inspect both branches and organization-wide
original-channel analytics; sign in as Manager to inspect Downtown promotions, branch analytics,
and the voided history; sign in as Staff to look up `(416) 555-0103`, complete its active claim on
a new receipt, then create a new fictional customer to see one-time channel capture. Use distinct
browser profiles when comparing roles. The Manager and Staff accounts cannot access Owner-only
organization analytics. The seed is a setup command, not a public web endpoint.

For a controlled reset, the operator must record the database identifier, time, and reason in the
deployment change log, stop the demo app, destroy and recreate **only** the dedicated demo database
through the database provider's authenticated console, rerun migrations, and rerun `seed:demo` with
fresh runtime confirmation and password. Never point the reset at a production database. The seed
refuses to overwrite an existing demo organization, and its `DEMO_SEED_CREATED` audit row records
the dataset counts. Database destruction removes in-database audit history, so retain the external
operator log and provider audit trail. There is no HTTP seed or reset route.

### Isolated guided demo sessions

The public `/demo` role selector is disabled by default. Use a **dedicated demo PostgreSQL database**;
its database name must include `demo`. Set a strong `AUTH_SECRET` (at least 32 characters) and
`DEMO_PUBLIC_ENTRY=1` only for that environment. Run migrations and provision a finite pool of
independent, fictional restaurant tenants from an operator shell:

```powershell
$env:DEMO_PUBLIC_ENTRY = "1"
$env:DEMO_POOL_CONFIRM = "restaurant-demo-pool"
$env:DEMO_POOL_COUNT = "12"
npm.cmd run prisma:migrate:deploy
npm.cmd run provision:demo-pool
Remove-Item Env:DEMO_POOL_CONFIRM, Env:DEMO_POOL_COUNT
```

Set `DATABASE_URL` and `AUTH_SECRET` in the runtime environment before these commands; never put a
real credential in the repository. The provisioning command also works for a dedicated demo deployment
built with `NODE_ENV=production` because it is an operator-only CLI, not an HTTP endpoint. It refuses
non-demo database names, missing confirmation, and pool counts outside 1–50. Every pool tenant has
separate customers, promotions, memberships, audit records, and random unavailable employee passwords.
The role selector atomically claims one unused tenant per visit, issues a single-use 60-second sign-in
ticket, and creates an Auth.js session for that tenant's selected employee role. The session expires
after two hours. Altering an organization, branch, or role in the URL cannot grant more permissions;
the normal server-side tenant and RBAC checks still apply. A visitor may choose another role, which
claims a fresh isolated tenant. The selector cannot run seed, reset, or migrations.

Visitor script: choose Owner to inspect both branches, promotions, organization analytics, and the
separate original-channel report; choose Manager to create a promotion, try Staff checkout, review
branch analytics, and void a completed redemption with a reason; choose Staff to look up fictional
`(416) 555-0103`, compare Best Deal, complete checkout with a new receipt, then create a new
fictional customer and capture an acquisition channel once. The persistent workspace banner identifies
the demo session and gives role-appropriate next steps. Each visit uses its own data, so another
visitor's edits cannot change this walkthrough.

Monitor the count of `DemoTenantLease` rows with `status = AVAILABLE` through an authenticated
database console. When low, run the same confirmed provisioning command to add tenants. Never recycle
a claimed tenant for a different visitor. For a full reset, record the demo database identifier, time,
reason, and operator in an external change log, disable `DEMO_PUBLIC_ENTRY`, stop the app, destroy and
recreate **only** that dedicated demo database in the provider console, rerun migrations and pool
provisioning, verify an Owner/Manager/Staff visit in separate browser profiles, then re-enable entry.
Database destruction also removes its in-database audit trail, so retain the external change log and
provider audit records. No public seed or reset endpoint exists.

### Public Demo URL

Not deployed yet. The operator should add the verified public URL here after Issue #25 deployment
and smoke verification. Until then, use the local `/login` route with the isolated demo database.

Managers and Owners can open **Promotions** from the branch workspace to create and edit bill-level
fixed, percentage, or spend-threshold offers, select branches, and activate, pause, or archive them.
Managers can create and manage offers for their authorized branch; Owners can target all branches.
Offers start as drafts and must be activated before Staff checkout can use them. The management
screen shows historical archived offers without deleting them.

The **Branch dashboard** shows Managers and Owners promotion activity for the selected branch.
The **Organization dashboard** shows Owners restaurant-wide promotion activity and original-channel
customer acquisition. Both use live tenant-scoped reports, exclude voided redemptions from sales,
and show empty states when no matching data exists. Acquisition figures are organization-wide
because customers do not have a first-branch attribution.

Managers and Owners can open **Redemption history** for the selected branch to review the 100 most
recent matching completed or voided records. Customer phone numbers are masked. A completed
redemption can be voided with a reason and explicit confirmation; the original record, void reason,
actor, and audit history remain available. Staff cannot open this screen or void redemptions.

### Public QR claim

An authenticated Manager or Owner can open the public claim page for an active promotion from
**Promotions** and use that URL as the destination of a restaurant-controlled QR code. The URL is
branch-specific. Customers enter a phone number without creating an account. For an existing
customer, a valid request creates a `QR` claim; new customers ask staff to create their record and
capture their original Acquisition Channel first. Checkout still rechecks eligibility, bill amount,
one-use-per-promotion, and receipt uniqueness. The public page always gives the same receipt message
for valid requests, including unknown customers, ineligible offers, duplicates, and rate limits.

The endpoint requires a strong `AUTH_SECRET` to HMAC phone and network rate-limit keys; it never
stores raw phone numbers or IP addresses in rate-limit rows. It limits requests per IP, branch,
promotion, and phone hash across app instances using PostgreSQL. On Vercel it reads the platform's
forwarded client address; other hosts use a conservative shared `unknown` address until a trusted
proxy header is configured. Run `npm.cmd run prune:public-claim-rate-limits` daily from an operator
job to remove counters that expired more than 24 hours ago. The command does not remove claims or
audit history.

## Product Vision

Most small and mid-sized restaurants can create discounts, but they often cannot answer the more important questions:

- Which promotions actually increase revenue?
- Which offers are being redeemed?
- How much discount cost is being given away?
- Which channels bring in new customers?
- Do customers acquired from a channel return later?
- Can staff redeem promotions quickly without making the customer create an account?

This project is designed to solve those problems with a staff-first workflow.

## Core Product Principle

Customers do **not** need to create an account or manage coupons themselves.

The restaurant staff handles the customer interaction:

1. Staff enters the customer's phone number.
2. The platform identifies whether the customer is new or returning.
3. New customers are asked once for their acquisition source.
4. Staff can claim eligible promotions for the customer.
5. At checkout, staff enters the bill subtotal and receipt number.
6. The system calculates all eligible promotions and highlights the **Best Deal**.
7. Staff selects one promotion and confirms redemption.
8. The platform records revenue, discount cost, and redemption history.
9. Managers and owners review promotion and customer acquisition analytics.

## Multi-Tenant SaaS Model

The platform is designed for many independent restaurant businesses.

Each restaurant organization has:

- One or more branches
- Its own customers
- Its own promotions
- Its own staff
- Its own analytics
- Strict data separation from other restaurant organizations

A promotion can apply to:

- All branches
- Selected branches only

## User Roles

### Owner

Owners have organization-wide access.

Capabilities include:

- Manage all branches
- Manage employees and permissions
- Create and edit promotions
- Pause and archive promotions
- View all revenue analytics
- View customer acquisition analytics
- View audit logs
- Configure restaurant settings

### Manager

Managers have operational and marketing permissions.

Capabilities include:

- All Staff capabilities
- Create promotions
- Edit active or scheduled promotions
- Pause promotions
- View branch analytics
- Manage acquisition channels
- Void incorrect redemptions

Managers cannot permanently delete historical promotion or redemption records.

### Staff

Staff members handle day-to-day customer interactions.

Capabilities include:

- Search customers by phone number
- Create a new customer
- Record a new customer's acquisition channel
- View eligible promotions
- Claim a promotion for a customer
- View Best Deal recommendations
- Enter receipt number and bill subtotal
- Redeem a promotion

Staff cannot:

- Create promotions
- Modify promotion rules
- Delete records
- View organization-wide revenue analytics
- Void completed redemptions

## Customer Identity

The primary customer identity is the phone number.

Customers do not need:

- Username
- Password
- Mobile app
- Customer dashboard
- Coupon wallet

A customer record is maintained internally so the restaurant can identify returning customers and measure long-term value.

Suggested customer fields:

- Phone number
- First seen date
- Last seen date
- First visit date
- Total visits
- Total spend
- Total discounts received
- Promotions claimed
- Promotions redeemed
- Acquisition channel
- Marketing consent, if collected in the future

## Acquisition Channel

Acquisition Channel is captured **only when a customer is first created**.

Examples:

- Xiaohongshu
- WeChat
- Instagram
- Google
- Friend Referral
- Walk-in
- Other
- Unknown / Not Sure

Returning customers are **not asked again**.

The original acquisition channel should normally remain unchanged.

### Channel Analytics

Channel analytics measure customer acquisition, not per-transaction marketing attribution.

Important metrics include:

- New customers acquired
- Returning customers
- Return rate
- Lifetime spend of customers acquired from the channel
- Average spend per acquired customer

Example:

| Channel | New Customers | Returned Later | Return Rate | Lifetime Spend |
| --- | ---: | ---: | ---: | ---: |
| Xiaohongshu | 128 | 51 | 39.8% | $9,820 |
| WeChat | 74 | 42 | 56.8% | $8,640 |
| Instagram | 39 | 11 | 28.2% | $2,930 |

## Promotion Engine

The Promotion Engine should support reusable combinations of rewards, conditions, and restrictions rather than hard-coding every marketing campaign.

### Reward Types

Initial supported promotion types may include:

- Fixed amount discount
- Percentage discount
- Spend threshold discount
- Buy One Get One
- Second item discount
- Specific item discount
- Category discount
- Free item
- Reward coupon after qualifying spend
- New-customer offer
- Returning-customer offer
- Birthday promotion
- Lunch promotion
- Holiday promotion

### Conditions

Possible conditions include:

- Minimum spend
- Maximum discount amount
- Valid start date
- Valid end date
- Valid time window
- Valid days of week
- New customer only
- Returning customer only
- Birthday eligibility
- Specific product
- Specific category
- All branches
- Selected branches

### Promotion Lifecycle

Promotions should not be permanently deleted once they have history.

Recommended lifecycle:

`Draft -> Scheduled -> Active -> Paused -> Ended -> Archived`

## Coupon and Redemption Rules

The initial business rules are:

- A customer can use the same Promotion only once.
- Different Promotions can be used on different orders.
- A customer may use different Promotions on the same day.
- One bill can use only one Promotion.
- One receipt should not be redeemed more than once within the applicable restaurant/branch scope.
- A Promotion may use a restaurant-defined code or a system-generated random code.
- Promotions may use a shared code or individually generated codes.
- The one-use-per-customer rule is enforced by customer identity and Promotion, not merely by code.
- Staff selects whether to apply a promotion.
- The Best Deal recommendation does not automatically redeem a Promotion.

## Best Deal

When a customer has multiple eligible promotions, the platform should calculate the savings for each one and highlight the highest-value option.

Example:

Bill subtotal: `$120.00`

| Promotion | Savings | Final Amount |
| --- | ---: | ---: |
| $5 OFF | $5.00 | $115.00 |
| $10 OFF $50 | $10.00 | $110.00 |
| 10% OFF | $12.00 | $108.00 |

The system displays:

**Best Deal: 10% OFF — Save $12.00**

Staff still chooses and confirms which promotion to redeem.

## Redemption Workflow

At checkout:

1. Staff enters the customer's phone number.
2. The system loads the customer and all eligible promotions.
3. Staff enters:
   - Bill subtotal
   - Receipt number
4. The system validates promotion eligibility.
5. The system calculates savings and highlights the Best Deal.
6. Staff chooses one promotion.
7. Staff confirms redemption.
8. The redemption becomes part of the permanent transaction history.

Suggested recorded fields:

- Customer
- Promotion
- Branch
- Staff member
- Receipt number
- Bill subtotal
- Discount amount
- Final bill amount
- Redemption timestamp
- Promotion code used
- Redemption status

## Void Redemption

If a redemption is entered incorrectly, only a Manager or Owner may void it.

A void must not delete history.

The system should record:

- Original redemption
- Voided by
- Void timestamp
- Void reason
- Previous values
- Resulting status

Example:

```text
Redemption #8392
Receipt: A10291
Subtotal: $68.00
Discount: $10.00
Original Staff: John
Status: VOIDED
Voided By: Manager Alice
Reason: Wrong receipt entered
```

## Promotion Analytics

The main business objective is to measure whether promotions generate meaningful revenue.

Key promotion metrics:

- Promotions claimed
- Promotions redeemed
- Redemption rate
- Gross bill amount
- Total discount given
- Net bill amount
- Average bill
- Unique customers redeemed
- New vs returning customers using the promotion

Example:

```text
Mid-Autumn Festival Promotion

Claims:              320
Redemptions:         104
Redemption Rate:     32.5%
Gross Revenue:       $8,920
Discount Given:      $1,040
Net Revenue:         $7,880
Average Bill:        $85.77
```

> Note: Gross and net bill totals show sales associated with redemption transactions. They should not automatically be interpreted as incremental revenue caused by the promotion without a proper baseline or control analysis.

## Customer Acquisition Analytics

Acquisition analytics answer a different question from Promotion Analytics.

Promotion Analytics:
> Which offers are being used, and how much transaction value is associated with them?

Acquisition Analytics:
> Which source originally brought new customers to the restaurant, and how valuable did those customers become over time?

These concepts should remain separate in the data model and dashboard.

## QR Code Support

The platform should support two QR-code use cases.

### Marketing / Acquisition QR

QR codes can be placed on:

- Xiaohongshu content
- WeChat
- Instagram
- Posters
- Flyers
- Menus
- Table cards
- Cashier displays

They may open a simple promotion claim page.

### Lightweight Customer Claim Page

The customer-facing page should remain intentionally minimal.

Example:

```text
$10 OFF when you spend $50

Enter your phone number:
[________________]

[Claim Offer]
```

After claiming:

```text
Offer claimed successfully.

Please provide your phone number when paying.
```

No account, password, coupon wallet, or customer dashboard is required.

## Staff-Assisted Claim

QR code use is optional.

A customer can also tell staff about an offer directly.

For a new customer:

1. Staff enters the phone number.
2. System creates a customer record.
3. Staff asks the acquisition source once.
4. Staff selects the appropriate Promotion.
5. Staff claims the Promotion on behalf of the customer.

For a returning customer:

1. Staff enters the phone number.
2. Existing customer is loaded.
3. Acquisition source is **not requested again**.
4. Staff continues directly to available promotions and checkout.

## MVP Scope

The first production-oriented MVP should focus on the smallest complete revenue-measurement loop.

### Included

- Multi-restaurant SaaS tenancy
- Multi-branch support
- Owner / Manager / Staff RBAC
- Phone-number customer identity
- New-customer acquisition channel
- Promotion creation
- Promotion lifecycle
- Shared and generated coupon codes
- Staff-assisted claims
- Lightweight QR claim flow
- Promotion eligibility validation
- Best Deal calculation
- Receipt number capture
- Bill subtotal capture
- One promotion per bill
- One use per customer per promotion
- Redemption
- Manager/Owner void workflow
- Audit log
- Promotion analytics
- Acquisition channel analytics

### Not Required for Initial MVP

- Full restaurant ordering system
- Customer mobile app
- Customer account/password system
- Loyalty points
- Membership tiers
- Inventory management
- Deep POS integration
- Automated SMS marketing
- Automated email campaigns
- AI-generated campaigns
- Full CRM automation

These can be added after the core workflow is stable.

## Suggested Core Entities

A possible initial domain model includes:

```text
RestaurantOrganization
Branch
User
Role
Customer
AcquisitionChannel
Promotion
PromotionBranch
PromotionRule
PromotionCode
CustomerPromotionClaim
Redemption
RedemptionVoid
AuditLog
```

## Important Data Constraints

Examples of database-level or service-level constraints:

```text
unique(restaurant_id, normalized_phone_number)

unique(customer_id, promotion_id, active_redemption)

unique(branch_id, receipt_number)

promotion_redemption_count_per_bill <= 1
```

Exact implementation may vary depending on the database design and void behavior.

## Security and Privacy

Because this platform stores customer phone numbers and business transaction data, production implementation should include:

- Tenant isolation
- Role-based authorization
- Encrypted transport
- Secure password storage
- Audit logging
- Phone-number normalization
- Minimal collection of personal information
- Retention policies
- Access control for analytics
- Rate limiting on public claim endpoints
- Abuse protection
- Privacy and marketing-consent handling where required

No payment-card data should be stored by this platform.

## Product Roadmap

### Phase 1 — Foundation

- SaaS organization model
- Branch model
- Authentication
- RBAC
- Staff management
- Customer search and creation

### Phase 2 — Promotion Engine

- Promotion CRUD
- Promotion lifecycle
- Branch targeting
- Rules and restrictions
- Coupon-code generation
- Eligibility engine

### Phase 3 — Claim and Redemption

- Staff-assisted claim
- QR claim page
- Best Deal
- Receipt and subtotal entry
- Redemption validation
- Void workflow
- Audit logs

### Phase 4 — Analytics

- Promotion dashboard
- Revenue metrics
- Discount metrics
- Acquisition channel dashboard
- New-customer cohorts
- Return-rate reporting

### Phase 5 — Commercial Expansion

Possible later capabilities:

- POS integrations
- SMS campaigns
- Email campaigns
- Loyalty program
- Customer segmentation
- Automated win-back promotions
- Birthday automation
- Advanced cohort analytics
- Subscription billing
- AI-assisted campaign recommendations

## Initial Success Criteria

The MVP is successful when a restaurant can:

1. Register and create branches.
2. Add Owner, Manager, and Staff users.
3. Create and activate a Promotion.
4. Register a new customer by phone number.
5. Capture that customer's acquisition channel once.
6. Claim a Promotion for that customer.
7. Retrieve the customer during checkout.
8. Enter subtotal and receipt number.
9. See eligible offers and the Best Deal.
10. Redeem exactly one Promotion for the bill.
11. Prevent repeat use of the same Promotion by the same customer.
12. Void an incorrect redemption with Manager/Owner permission.
13. See how much sales value is associated with Promotion redemptions.
14. See which acquisition sources bring in new customers.

## Project Status

**Status: Product definition / pre-development**

The product scope and initial business rules are being finalized before implementation.

## License

License to be determined before public release.
