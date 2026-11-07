import Link from "next/link";

import styles from "./home.module.css";

const workflow = [
  {
    title: "Find the customer",
    detail:
      "Staff looks up a phone number. A new customer records an original acquisition channel once; a returning customer skips that question."
  },
  {
    title: "Compare the offers",
    detail:
      "The checkout checks eligible promotions against the bill. Best Deal highlights the largest immediate saving, while Staff chooses the offer."
  },
  {
    title: "Confirm the receipt",
    detail:
      "Staff enters a subtotal and receipt number. The transaction rechecks eligibility, blocks a duplicate receipt or repeat use, and keeps an audit record."
  },
  {
    title: "Review the result",
    detail:
      "Managers and Owners can inspect promotion-linked sales, discounts, and redemption history. A void preserves the original record."
  }
];

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroTop}>
          <span className={styles.wordmark}>Restaurant Promotion Platform</span>
          <Link href="/login" className={styles.topLink}>
            Employee sign in
          </Link>
        </div>
        <h1 id="home-title" className={styles.heroTitle}>
          From phone
          <br />
          to receipt.
        </h1>
        <div className={styles.heroBottom}>
          <p>
            A restaurant promotion platform for staff checkout, one-time customer acquisition
            capture, and honest promotion reporting.
          </p>
          <Link href="/demo" className={styles.heroAction}>
            Open the demo
          </Link>
        </div>
      </section>

      <section className={styles.intro} id="why" aria-labelledby="why-title">
        <h2 id="why-title">Discounts leave questions.</h2>
        <p>
          A promotion can be redeemed without revealing where a customer first heard about the
          restaurant, whether they returned, or how much of a bill was discounted. This platform
          connects those records to a staff workflow and keeps the two kinds of analysis separate.
        </p>
        <div className={styles.facts}>
          <p>Customers use a phone number. No customer account is required.</p>
          <p>One completed redemption per customer and promotion.</p>
          <p>Voided redemptions remain in history and leave sales totals.</p>
        </div>
      </section>

      <section className={styles.workflow} id="workflow" aria-labelledby="workflow-title">
        <h2 id="workflow-title">The Staff checkout</h2>
        <p className={styles.sectionLead}>Open each moment to see what the live workflow checks.</p>
        <div className={styles.workflowList}>
          {workflow.map((item) => (
            <details key={item.title} className={styles.workflowItem}>
              <summary>{item.title}</summary>
              <p>{item.detail}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.reporting} id="reporting" aria-labelledby="reporting-title">
        <h2 id="reporting-title">Two questions. Clear answers.</h2>
        <div className={styles.reportColumns}>
          <div>
            <h3>Promotions</h3>
            <p>
              Which offers were claimed and redeemed? See associated bill totals and discounts,
              excluding voided transactions. These are promotion-linked sales, not a claim of
              incremental revenue.
            </p>
          </div>
          <div>
            <h3>Acquisition</h3>
            <p>
              Which original channels brought in customers, and which customers returned? The
              organization report uses first-captured channels; it does not attribute each purchase
              to a marketing channel.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.build} id="build" aria-labelledby="build-title">
        <h2 id="build-title">Built around the transaction</h2>
        <p>
          Next.js and TypeScript serve the employee interface. Auth.js credentials and server-side
          role checks protect Owner, Manager, and Staff access. PostgreSQL and Prisma keep tenant
          records, receipt uniqueness, and audit history together. GitHub Actions validates the
          application before changes reach main.
        </p>
        <a href="https://github.com/Winfred01/restaurant-promotion-platform">
          View the source on GitHub
        </a>
      </section>

      <section className={styles.demo} aria-labelledby="demo-title">
        <h2 id="demo-title">Try the real workflow</h2>
        <p>
          The demo currently runs locally with an isolated seeded database. A public URL will be
          added after deployment and smoke verification. Guided role entry opens isolated sessions
          when the dedicated demo environment is configured.
        </p>
        <Link href="/demo" className={styles.demoLink}>
          Choose a role
        </Link>
      </section>

      <footer className={styles.footer}>
        <p>Restaurant Promotion Platform</p>
        <div>
          <Link href="/login">Employee sign in</Link>
          <a href="https://github.com/Winfred01/restaurant-promotion-platform">GitHub repository</a>
          <a href="#home-title">Back to top</a>
        </div>
      </footer>
    </main>
  );
}
