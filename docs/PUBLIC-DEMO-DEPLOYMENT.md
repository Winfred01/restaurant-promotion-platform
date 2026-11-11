# Public Demo deployment

The hosted application is a personal portfolio demonstration using fictional customer and transaction data. The real Next.js workspace, Auth.js sessions, Prisma 6.12.0, and PostgreSQL enforce the same tenant and role boundaries as local development.

## Accounts and isolation

Use Vercel Hobby for a personal, non-commercial demo. Keep each database in its own Neon Free project and use the included `vercel.app` domain. The existing `restaurant-promotion-platform` Neon project is outside this procedure. [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines), [Vercel plans](https://vercel.com/pricing), [Neon plans](https://neon.com/pricing)

| Stage                                 | Database                                                                                  | Access                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Local development                     | Local PostgreSQL, for example `restaurant_promotion_demo`                                 | Developer only                                                 |
| Vercel Preview                        | `restaurant-promotion-preview-demo` project, `restaurant_promotion_preview_demo` database | Vercel Authentication with Standard Protection                 |
| Vercel Production for the public demo | `restaurant-promotion-public-demo` project, `restaurant_promotion_public_demo` database   | Public application domain, with isolated Auth.js demo sessions |
| Future production                     | Separately provisioned project, roles and secrets                                         | Employee authentication with release and privacy controls      |

Neon Free currently lists 1 GB of storage and 100 CU-hours per project per month. Keep scale-to-zero enabled. Vercel Hobby includes 100 GB of fast data transfer, one million function invocations and one WAF rate rule per project. Limits can pause service. Vercel Pro starts at USD 20/month plus applicable usage if commercial hosting is needed. Render Free can host a portfolio demo with Neon Free, subject to Render's 750 shared instance hours, 512 MB RAM, and idle cold starts. Review any paid plan or add-on separately. [Neon Free plan](https://neon.com/blog/neon-free-plan-1-gb-per-project), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Vercel rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), [Render Free](https://render.com/docs/free)

## Operator migration and initialization

1. Work from a clean checkout of the exact commit to deploy using Node.js 22 and `npm ci`. Open the intended Neon project's **Connect** panel and verify the project, endpoint, and exact database name. Use a direct TLS connection as the migration owner. Keep the connection string in the operator shell only. Check the target in the Neon SQL Editor or with `psql` using `SELECT current_database(), current_user;`. Record the stage, project/branch IDs, database name, commit SHA, operator, and UTC time in the release log. Keep credentials and full connection strings out of the log.
2. Run `npm run prisma:generate`, `npm run prisma:migrate:deploy`, then `npm exec -- prisma migrate status`. Repeat against Preview first. In a new database `migrate deploy` should apply all tracked migrations. A retry after success should report no pending migrations. Review and apply future migrations explicitly before deploying a compatible application.
3. In the same operator shell set `DEMO_PUBLIC_ENTRY=1`, `DEMO_POOL_CONFIRM=restaurant-demo-pool`, `DEMO_POOL_TARGET=<direct host[:port]>/<exact database name>`, and `DEMO_POOL_COUNT=12` for Preview or `24` for Public Demo. Run `npm run provision:demo-pool`. Record the number of tenants added and rerun to verify that the same target adds zero before any leases are claimed.

The replenisher verifies the connection's database identity, rejects unrelated organizations and accounts on hosted targets, serializes concurrent provisioning runs and adds only enough fresh tenants to reach the requested available count. Each tenant has independent roles, customers, promotions, claims, completed and voided redemptions, and audit rows. The shared-account `seed:demo` remains blocked in production mode. Keep all provisioning variables and migration credentials in the operator shell. There is no HTTP initializer or reset. Clear the operator environment after the procedure.

In Neon create a dedicated PostgreSQL login for the Vercel runtime in each project. Use a regular PostgreSQL role without Neon owner or migration privileges. Grant `USAGE` on `public`, `SELECT, INSERT, UPDATE` on the application tables and `DELETE` on `"PromotionBranch"` for promotion retargeting. Exclude `"_prisma_migrations"` and grant only `SELECT, INSERT` on `"AuditLog"`. Apply necessary grants on new tables after future migrations. Test with the runtime credential before releasing.

## Vercel configuration and staged release

1. In the personal Hobby scope, connect the GitHub App with access to **only** `Winfred01/restaurant-promotion-platform`. Import the repository with the Next.js preset, repository root, and `main` as the Production branch. Keep guided entry off during the initial import. Turn on Vercel system environment variables and Standard Protection. Review the first import, which may trigger a build of `main`.
2. Add variables separately in **Settings → Environment Variables**. The Vercel Production environment in this project represents the public demo. Set flags only after the corresponding database and fixture pool are ready.

   | Variable                                           | Preview and Public Demo                                                                                                                                                                      |
   | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`                                     | Corresponding Neon **pooled** TLS runtime URL, with `connection_limit=1&pool_timeout=10&connect_timeout=15` appended to the existing query string. Keep Neon-provided connection parameters. |
   | `AUTH_SECRET`                                      | A different cryptographically random secret per stage, at least 32 characters.                                                                                                               |
   | `DEMO_FIXTURES_ONLY`                               | `1` for both stages. Restricts phone inputs to the fictional fixture range and employee sign-in to the guided demo.                                                                          |
   | `DEMO_PUBLIC_ENTRY`                                | `1` only after initialization and release controls. Unset to close demo entry after redeploy.                                                                                                |
   | `AUTH_URL`, `AUTH_TRUST_HOST`                      | Leave unset on Vercel. Auth.js uses Vercel's trusted HTTPS host headers for the deployment being visited. Use a loopback `AUTH_URL` for local runs.                                          |
   | `DEMO_LOGIN_ENABLED`, `DEMO_SEED_*`, `DEMO_POOL_*` | Leave unset in hosted app environments.                                                                                                                                                      |

   Vercel builds with Node.js 22, `npm ci`, and `npm run build:deploy` from the checked-in configuration. The build regenerates Prisma Client and compiles Next.js. Run migrations through the separate direct operator connection. Keep Prisma and `@node-rs/argon2` on the Node runtime, with npm optional native packages enabled. Choose a Vercel function region near the Neon compute and check connection and transaction timeouts in Preview. [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Prisma serverless connections](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections), [Neon pooling](https://neon.com/docs/connect/connection-pooling), [Auth.js deployment](https://authjs.dev/getting-started/deployment)

3. In **Firewall**, publish the Hobby rate rule for source IP. Match method `POST` and a request path matching `^/(demo|api/(auth/.*|public/claims))/?$`. Start at 6 requests per 60 seconds and return 429 above the threshold. Check the configured rule and events with ordinary smoke traffic. The public QR API also uses PostgreSQL-backed rate counters. Protected Preview URLs and the finite lease pool provide additional limits. Keep request body logging and log drains disabled. Vercel runtime logs can include URL query parameters. Use the POST lookup and never send customer information in a URL. Verify `GET /api/staff/customers` returns 405 in fixture mode.
4. Deploy the Issue #25 branch through GitHub Preview and verify the runtime before review. Test the protected URL with an authenticated Vercel browser. The repository's `vercel.json` disables Git-driven `main` deploys. Once a reviewer merges the PR and `main` CI passes, confirm the exact SHA, Production variables, migration status, and fixture stock. From a clean linked checkout, run `vercel deploy --prod --skip-domain` to stage the Production build without moving the public domain. Verify the staged deployment in the Vercel session, then run `vercel promote <verified-staged-deployment-url>`. [Git deployment settings](https://vercel.com/docs/project-configuration/git-configuration), [Staged Production deployments](https://vercel.com/docs/cli/deploying-from-cli)
5. Verify the actual public domain from a fresh browser context. Publish its verified URL in both READMEs once the checks below pass. Record deployment ID, SHA, URL, smoke result, runtime log review, and release time in the operator log.

## Smoke and security checks

Run from the exact deployed revision, using only the isolated seeded demo. The automated check consumes three tenant leases and performs one synthetic checkout.

```powershell
$env:DEMO_SMOKE_BASE_URL = Read-Host "Verified public HTTPS origin"
npm.cmd run smoke:demo
Remove-Item Env:DEMO_SMOKE_BASE_URL
```

- Confirm the landing page and demo entry load anonymously over HTTPS. Verify Auth.js secure, HTTP-only session cookies, server-side role checks, a denied cross-tenant route, and Staff denial of management history.
- Check Owner analytics and both branches, Manager promotions and voided history, and a 390px Staff checkout. Use `(416) 555-0103` and a fictional receipt. Verify Best Deal, the successful redemption, complete form and draft clearing, and persistent rejection of the duplicate receipt after reload. An authenticated operator may also verify the corresponding synthetic receipt and audit record in the dedicated database.
- Confirm unauthenticated workspace requests redirect, foreign-origin writes are rejected, seed/reset routes are absent, and existing CI tests still cover concurrent redemptions and repeat submissions. Check server and provider logs for full phone numbers, connection strings, passwords, session values and credentials. Ensure no actual customer or transaction data was entered into free-text fields.
- Checkout drafts use browser tab storage to revalidate on reload. A browser can restore that storage across sessions. The draft expires after 30 minutes of inactivity and is removed on redemption, start over, sign-out, or same-tab role change. Hosted mode permits only the reserved fictional number range. The legacy GET remains available to ordinary employee deployments, where operators need an independent query-log policy.

## Maintenance and recovery

- Check remaining fresh `AVAILABLE` leases after release and during normal use. Refill below six with the same operator command. Leases older than 21 days are excluded so each new visit starts with active offers. Each role consumes a fresh tenant and has at most two hours of access. Old and claimed tenants stay isolated.
- Review Neon storage, compute and Vercel usage. Run `npm run prune:public-claim-rate-limits` with the operator connection to the dedicated database to expire old QR rate counters. Keep an external log of each refill and cleanup.
- If the pool is being drained, temporarily deny `POST /demo` at the firewall and inspect the rate and usage events. Use `DEMO_PUBLIC_ENTRY` and a redeploy for extended suspension. Hobby limits and distributed traffic can still make the demo unavailable. If a release fails after promotion, switch to a previously verified schema-compatible deployment or keep entry closed while fixing forward.
- If storage requires a full reset, provision a fresh independent Free project and migrate/seed it, then switch the scoped runtime URL through a staged deploy. Record the old and new target identifiers, operator and reason. Retain the old project's audit records until the operator's planned archival process. Never recycle a claimed tenant across visitors.
