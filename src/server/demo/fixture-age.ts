export function earliestFreshDemoFixture(now = Date.now()) {
  // Active fixture offers last 30 days. Leave time for the entire guided visit.
  return new Date(now - 21 * 86_400_000);
}
