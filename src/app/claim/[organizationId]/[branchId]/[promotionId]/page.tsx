import Link from "next/link";

import ClaimForm from "./claim-form";
import styles from "./claim.module.css";

export default async function PublicClaimPage({
  params
}: {
  params: Promise<{ organizationId: string; branchId: string; promotionId: string }>;
}) {
  const context = await params;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Restaurant Promotion Platform
        </Link>
      </header>
      <section className={styles.card} aria-labelledby="claim-title">
        <span className={styles.eyebrow}>Restaurant promotion</span>
        <h1 id="claim-title">Save this offer for checkout.</h1>
        <p>
          Enter the phone number you have used at this restaurant. Staff will confirm eligibility
          and the final discount with your bill. New to this restaurant? Ask staff to create your
          customer record first.
        </p>
        <ClaimForm context={context} />
        <p className={styles.note}>
          This request does not guarantee a discount. You do not need an account or password.
        </p>
      </section>
    </main>
  );
}
