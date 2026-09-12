# 餐厅营销优惠与营收增长平台

一个面向餐饮商家的多租户 SaaS 平台，用于创建 Promotion、管理优惠券领取与核销、记录新客来源，并通过数据分析衡量营销活动对营业额的实际贡献。

---

## 项目愿景

很多中小型餐厅会做折扣和优惠活动，但往往无法准确回答这些问题：

- 哪些 Promotion 真正带来了更多营业额？
- 哪些优惠最受顾客欢迎？
- 一共让利了多少金额？
- 哪些渠道带来了最多新顾客？
- 从不同渠道来的新顾客，之后会不会再次回来？
- 能不能让员工快速核销优惠，而不要求顾客注册账号？

这个项目的目标，就是用一个简单、员工友好的系统解决这些问题。

---

## 核心产品原则

顾客**不需要注册账号，也不需要管理自己的优惠券**。

系统以店员操作为核心。

基本流程如下：

1. 店员输入顾客手机号。
2. 系统判断顾客是新用户还是老用户。
3. 如果是新用户，店员只在第一次询问一次来源渠道。
4. 店员可以帮助顾客领取可用 Promotion。
5. 结账时，店员输入账单金额和 Receipt Number。
6. 系统计算所有可用优惠，并推荐 **Best Deal**。
7. 店员选择一个 Promotion 并确认核销。
8. 系统记录消费金额、优惠金额和核销记录。
9. Manager 和 Owner 可以查看 Promotion 与新客来源分析。

---

## 多租户 SaaS 模式

系统面向多个不同餐厅使用。

每个餐厅都是一个独立的 Restaurant Organization，并拥有：

- 一个或多个分店
- 自己的顾客数据
- 自己的 Promotion
- 自己的员工
- 自己的 Analytics
- 与其他餐厅完全隔离的数据

Promotion 可以设置为：

- `All Branches`
- `Selected Branches`

---

## 用户角色

### Owner

Owner 拥有整个餐厅组织的最高权限。

主要权限：

- 管理所有分店
- 管理员工与权限
- 创建和编辑 Promotion
- 暂停或归档 Promotion
- 查看全部 Revenue Analytics
- 查看 Customer Acquisition Analytics
- 查看 Audit Log
- 管理餐厅设置

---

### Manager

Manager 负责日常运营和营销管理。

主要权限：

- 拥有 Staff 的所有权限
- 创建 Promotion
- 编辑 Scheduled / Active Promotion
- 暂停 Promotion
- 查看分店 Analytics
- 管理 Acquisition Channel
- Void 错误核销记录

Manager 不可以永久删除历史 Promotion 或 Redemption 数据。

---

### Staff

Staff 负责日常顾客优惠操作。

主要权限：

- 通过手机号查询顾客
- 创建新顾客
- 记录新顾客首次来源 Channel
- 查看顾客可用 Promotion
- 帮助顾客领取 Promotion
- 查看 Best Deal 推荐
- 输入 Receipt Number
- 输入 Bill Subtotal
- 核销 Promotion

Staff 不可以：

- 创建 Promotion
- 修改 Promotion 规则
- 删除历史记录
- 查看全部组织级 Revenue Analytics
- Void 已完成核销

---

## 顾客身份识别

顾客的主要身份标识为：

**Phone Number**

顾客不需要：

- 用户名
- 密码
- 手机 App
- Customer Dashboard
- Coupon Wallet

系统会在后台维护 Customer Profile，用于识别老顾客和计算长期价值。

建议保存字段：

- Phone Number
- First Seen Date
- First Visit Date
- Last Seen Date
- Total Visits
- Total Spend
- Total Discounts Received
- Promotions Claimed
- Promotions Redeemed
- Acquisition Channel
- Marketing Consent（未来可选）

---

## Acquisition Channel

Channel 只用于记录：

> **这个新顾客最初是从哪里来的。**

只在顾客第一次出现时记录一次。

示例：

- 小红书 Xiaohongshu
- 微信 WeChat
- Instagram
- Google
- Friend Referral
- Walk-in
- Other
- Unknown / Not Sure

老顾客再次到店时：

**不再询问 Channel。**

原始 Acquisition Channel 默认保持不变。

---

## Channel Analytics

Channel Analytics 的目的不是给每一笔消费做渠道归因。

它关注的是：

> 哪个渠道真正为餐厅带来了更多新顾客？

核心指标：

- New Customers Acquired
- Returning Customers
- Return Rate
- Lifetime Spend
- Average Spend per Acquired Customer

示例：

| Channel | 新顾客 | 后续回访顾客 | 回访率 | Lifetime Spend |
| --- | ---: | ---: | ---: | ---: |
| Xiaohongshu | 128 | 51 | 39.8% | $9,820 |
| WeChat | 74 | 42 | 56.8% | $8,640 |
| Instagram | 39 | 11 | 28.2% | $2,930 |

这样老板可以判断：

> 哪个平台不仅带来了新客，而且带来的顾客质量更高。

---

## Promotion Engine

Promotion Engine 不应该把每一种活动都写死。

系统应该通过：

- Reward
- Conditions
- Restrictions

组合出不同 Promotion。

---

## Promotion 类型

第一版可以支持：

- 固定金额优惠
- 百分比折扣
- 满额减免
- Buy One Get One
- 第二件折扣
- 指定菜品优惠
- 指定分类优惠
- Free Item
- 消费满额送下次优惠券
- 新客优惠
- 老客回归优惠
- Birthday Promotion
- Lunch Promotion
- Holiday Promotion

例如：

```text
$5 OFF

10% OFF

Spend $50, Save $10

Buy One Get One Free

Second Item 50% Off

Lunch Special 15% Off
```

---

## Promotion Conditions

Promotion 可以设置以下条件：

- Minimum Spend
- Maximum Discount
- Valid Start Date
- Valid End Date
- Valid Time Window
- Valid Day of Week
- New Customer Only
- Returning Customer Only
- Birthday Eligibility
- Specific Product
- Specific Category
- All Branches
- Selected Branches

例如：

```text
Promotion:
Spend $50, Save $10

Conditions:
- Monday to Thursday
- 11:00 AM – 3:00 PM
- Minimum Spend: $50
- Selected Branches Only
```

---

## Promotion 生命周期

Promotion 一旦产生历史数据，不应该被真正删除。

推荐状态：

```text
Draft
  ↓
Scheduled
  ↓
Active
  ↓
Paused
  ↓
Ended
  ↓
Archived
```

这样可以保证历史数据和财务记录不会丢失。

---

## Coupon 与 Redemption 规则

初始业务规则：

- 一个顾客对同一个 Promotion 只能成功使用一次
- 不同 Promotion 可以在不同订单使用
- 同一天可以使用不同 Promotion
- 一个 Bill 只能使用一个 Promotion
- 同一个 Receipt 不允许重复核销
- Promotion Code 可以由店家自己填写
- Promotion Code 也可以由系统随机生成
- 可以使用所有顾客共用的 Code
- 也可以生成一次性 Code
- 防重复使用逻辑基于 Customer + Promotion，而不是只基于 Code
- Staff 最终决定使用哪个 Promotion
- Best Deal 只是推荐，不自动核销

---

## Best Deal

如果顾客同时拥有多个可用优惠，系统应该自动计算哪个最省钱。

示例：

Bill Subtotal：

```text
$120.00
```

| Promotion | 优惠金额 | 最终金额 |
| --- | ---: | ---: |
| $5 OFF | $5.00 | $115.00 |
| Spend $50 Get $10 OFF | $10.00 | $110.00 |
| 10% OFF | $12.00 | $108.00 |

系统显示：

> **Best Deal: 10% OFF — Save $12.00**

但是系统不会自动选择。

最终仍由 Staff 点击确认。

---

## Redemption 流程

顾客付款时：

1. Staff 输入手机号
2. 系统加载 Customer Profile
3. 系统显示所有 Eligible Promotions
4. Staff 输入 Bill Subtotal
5. Staff 输入 Receipt Number
6. 系统验证 Promotion 条件
7. 系统计算所有优惠金额
8. 系统标记 Best Deal
9. Staff 选择一个 Promotion
10. Staff 点击 Confirm Redemption
11. 系统保存记录

建议保存：

- Customer
- Promotion
- Branch
- Staff
- Receipt Number
- Bill Subtotal
- Discount Amount
- Final Bill Amount
- Promotion Code
- Redemption Time
- Redemption Status

---

## Void Redemption

如果 Staff 核销错误：

只有：

- Manager
- Owner

可以执行：

`Void Redemption`

Void 不等于删除。

系统必须保留：

- Original Redemption
- Voided By
- Void Time
- Void Reason
- Previous Values
- Final Status

示例：

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

---

## Staff 帮助顾客领取 Promotion

顾客不一定要自己扫码。

Staff 可以直接帮顾客领取 Promotion。

### 新顾客

流程：

1. Staff 输入手机号
2. 系统发现手机号不存在
3. 创建 Customer
4. Staff 询问一次 Acquisition Channel
5. Staff 选择顾客想参加的 Promotion
6. 点击 Claim Promotion

例如：

```text
Phone:
416-555-1234

How did you hear about us?

[Xiaohongshu]
[WeChat]
[Instagram]
[Google]
[Friend]
[Walk-in]
[Other]
```

这个 Channel 只填写一次。

---

### 老顾客

流程：

1. Staff 输入手机号
2. 系统发现已有 Customer
3. 直接显示 Customer Profile
4. 不再询问 Channel
5. 直接进入 Promotion / Checkout

---

## QR Code 支持

系统支持两种 QR 使用方式。

### 方式 A：Marketing QR

餐厅可以把 QR Code 放到：

- 小红书
- 微信
- Instagram
- 海报
- Flyer
- 菜单
- Table Card
- 收银台

QR Code 可以指向 Promotion Claim Page。

---

### 方式 B：顾客简单领取页面

顾客扫码后只需要看到一个非常简单的页面。

例如：

```text
Spend $50, Get $10 OFF

Phone Number:
[________________]

[Claim Offer]
```

提交以后：

```text
Offer Claimed Successfully

Please provide your phone number when paying.
```

不需要：

- 注册
- 登录
- 密码
- Customer Dashboard
- Coupon Wallet

---

## Promotion Analytics

产品最重要的目标之一，是帮助老板了解：

> Promotion 到底和多少营业额有关。

主要指标：

- Claims
- Redemptions
- Redemption Rate
- Gross Bill Amount
- Total Discount Given
- Net Bill Amount
- Average Bill
- Unique Customers
- New Customers
- Returning Customers

示例：

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

注意：

> Gross Revenue 和 Net Revenue 表示与 Promotion 核销交易相关的销售金额。

它们不能直接被解释成：

> “Promotion 额外创造了这么多增量收入。”

如果未来需要计算真正 Incremental Revenue，需要额外做：

- Baseline
- Historical Comparison
- Control Group
- Cohort Analysis

---

## Promotion Analytics 与 Channel Analytics 的区别

这两个概念必须分开。

### Promotion Analytics

回答：

> 哪些优惠被使用了？

> 使用这些优惠的订单金额是多少？

---

### Acquisition Channel Analytics

回答：

> 哪个平台最初带来了这个新顾客？

> 从这个渠道来的顾客以后有没有回来？

> 这些顾客长期消费价值是多少？

---

## MVP 范围

第一版目标不是做一个功能非常复杂的平台。

而是先完成一个完整的闭环：

```text
Promotion
    ↓
Customer
    ↓
Claim
    ↓
Redemption
    ↓
Revenue Measurement
    ↓
Analytics
```

---

## MVP 必须包含

- Multi-Restaurant SaaS
- Multi-Branch
- Owner / Manager / Staff RBAC
- Phone Number Customer Identity
- New Customer Acquisition Channel
- Promotion Creation
- Promotion Lifecycle
- Shared Coupon Code
- Random Coupon Code
- Staff-Assisted Claim
- QR Claim
- Promotion Eligibility Validation
- Best Deal
- Receipt Number
- Bill Subtotal
- One Promotion per Bill
- One Use per Customer per Promotion
- Redemption
- Void Redemption
- Audit Log
- Promotion Analytics
- Acquisition Channel Analytics

---

## MVP 暂时不做

第一版暂时不需要：

- 完整点餐系统
- Customer App
- Customer Account
- Loyalty Points
- Membership Tier
- Inventory
- 深度 POS Integration
- SMS Marketing Automation
- Email Campaign Automation
- AI Marketing Campaign
- Full CRM Automation

这些功能可以在核心流程稳定以后加入。

---

## 建议核心数据实体

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

---

## 关键数据约束

例如：

```text
unique(
    restaurant_id,
    normalized_phone_number
)
```

保证同一家餐厅内部，一个手机号只对应一个顾客。

---

```text
unique(
    customer_id,
    promotion_id,
    active_redemption
)
```

避免同一顾客重复使用同一个 Promotion。

---

```text
unique(
    branch_id,
    receipt_number
)
```

避免同一 Receipt 重复核销。

---

系统还需要保证：

```text
promotion_per_bill <= 1
```

即：

> 一个 Bill 只能成功应用一个 Promotion。

---

## Audit Log

真实商用版本必须保留操作日志。

例如：

```text
2026-09-11 18:42

User:
Manager Alice

Action:
VOID_REDEMPTION

Redemption:
#8392

Reason:
Wrong receipt number
```

建议记录：

- User
- Role
- Action
- Entity Type
- Entity ID
- Previous Value
- New Value
- Timestamp
- Reason

---

## 安全与隐私

因为系统会保存：

- Customer Phone Number
- Transaction Amount
- Employee Accounts
- Restaurant Analytics

所以正式商用版本必须考虑：

- Tenant Isolation
- Role-Based Access Control
- HTTPS
- Secure Password Hashing
- Audit Logging
- Phone Number Normalization
- Data Minimization
- Rate Limiting
- Abuse Protection
- Access Control
- Data Retention
- Privacy Compliance
- Marketing Consent

系统不应该保存：

- 信用卡号码
- CVV
- 银行卡信息

支付仍由餐厅现有 POS 或支付系统处理。

---

# 开发 Roadmap

## Phase 1 — Foundation

目标：

建立 SaaS 基础架构。

包括：

- Restaurant Organization
- Branch
- Authentication
- RBAC
- Owner / Manager / Staff
- Staff Management
- Customer Search
- Customer Creation

---

## Phase 2 — Promotion Engine

包括：

- Promotion CRUD
- Promotion Status
- Branch Targeting
- Promotion Rules
- Promotion Conditions
- Coupon Code Generation
- Eligibility Engine

---

## Phase 3 — Claim & Redemption

包括：

- Staff-Assisted Claim
- QR Claim
- Best Deal
- Bill Subtotal
- Receipt Number
- Redemption Validation
- Confirm Redemption
- Void Redemption
- Audit Log

---

## Phase 4 — Analytics

包括：

- Promotion Dashboard
- Revenue Metrics
- Discount Metrics
- Acquisition Channel Dashboard
- New Customer Analytics
- Customer Return Rate
- Cohort Analytics

---

## Phase 5 — 商业化扩展

未来可以加入：

- POS Integration
- SMS Campaign
- Email Campaign
- Loyalty Program
- Customer Segmentation
- Birthday Automation
- Win-Back Promotion
- Subscription Billing
- Advanced Cohort Analytics
- AI Promotion Recommendation

---

# MVP 成功标准

当餐厅能够完成以下流程时，MVP 就算成功：

1. 注册 Restaurant Organization
2. 创建多个 Branch
3. 创建 Owner / Manager / Staff
4. 创建 Promotion
5. 激活 Promotion
6. Staff 输入顾客手机号
7. 新顾客第一次记录 Acquisition Channel
8. 老顾客不再询问 Channel
9. Staff 帮助顾客 Claim Promotion
10. 结账时输入 Bill Subtotal
11. 输入 Receipt Number
12. 系统显示 Eligible Promotions
13. 系统计算 Best Deal
14. 一个 Bill 只能选择一个 Promotion
15. 同一顾客不能重复使用同一 Promotion
16. Manager / Owner 可以 Void 错误 Redemption
17. Owner 可以查看 Promotion Revenue Analytics
18. Owner 可以查看各 Channel 带来的新顾客数量

---

# 项目当前状态

**当前阶段：Product Definition / Pre-Development**

目前已经明确：

- 产品目标
- 用户角色
- Promotion 基本规则
- Redemption 规则
- Customer Identity
- Acquisition Channel 逻辑
- Multi-Branch 模型
- MVP 范围
- 基础 Analytics

下一步建议进入：

1. PRD
2. System Architecture
3. Database Schema
4. API Design
5. GitHub Issues
6. Development Roadmap

---

# License

正式公开发布前再确定 License。
