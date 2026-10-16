export function parseSubtotalCents(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [dollars, fraction = ""] = trimmed.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  return cents > 0 && cents <= 2_147_483_647 ? cents : null;
}

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
