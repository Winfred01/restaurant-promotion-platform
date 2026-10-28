import { PromotionRewardType } from "@prisma/client";

import type { PromotionDefinitionInput } from "@/server/promotions/lifecycle";

function field(data: FormData, name: string) {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function cents(value: string, label: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`${label} must be a dollar amount.`);
  const [dollars, fraction = ""] = value.split(".");
  const amount = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return amount;
}

function date(value: string) {
  if (!value) return undefined;
  const parsed = new Date(`${value}Z`);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || Number.isNaN(parsed.valueOf())) {
    throw new Error("Enter valid UTC start and end times.");
  }
  return parsed;
}

export function parsePromotionForm(data: FormData): PromotionDefinitionInput {
  const base = {
    name: field(data, "name"),
    description: field(data, "description"),
    validFrom: date(field(data, "validFrom")),
    validUntil: date(field(data, "validUntil")),
    appliesToAllBranches: field(data, "scope") === "all",
    branchIds: data.getAll("branchIds").filter((id): id is string => typeof id === "string")
  };
  const rewardType = field(data, "rewardType");
  if (rewardType === PromotionRewardType.FIXED_AMOUNT) {
    return { ...base, rewardType, discountCents: cents(field(data, "discount"), "Discount") };
  }
  if (rewardType === PromotionRewardType.PERCENTAGE) {
    const percent = Number(field(data, "percent"));
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      throw new Error("Percentage must be between 1 and 100.");
    }
    const maximum = field(data, "maximum");
    return {
      ...base,
      rewardType,
      discountPercent: percent,
      maxDiscountCents: maximum ? cents(maximum, "Maximum discount") : undefined
    };
  }
  if (rewardType === PromotionRewardType.SPEND_THRESHOLD) {
    return {
      ...base,
      rewardType,
      discountCents: cents(field(data, "discount"), "Discount"),
      minimumSpendCents: cents(field(data, "minimum"), "Minimum spend")
    };
  }
  throw new Error("Choose a supported reward type.");
}
