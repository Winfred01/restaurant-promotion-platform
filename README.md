# Restaurant Promotion & Revenue Growth Platform

A multi-tenant SaaS platform for restaurants to create promotions, manage coupon redemption, capture new-customer acquisition sources, and measure how promotions contribute to revenue.

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
