import { z } from "zod";

const prefix = "staff-checkout:v1:";
export const checkoutDraftLifetimeMs = 30 * 60 * 1000;

const draftSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  channelId: z.string().max(191),
  subtotal: z.string().max(16),
  receipt: z.string().max(80),
  selected: z.string().max(191),
  expiresAt: z.number().int()
});

export type CheckoutDraft = z.infer<typeof draftSchema>;
export type CheckoutStep = CheckoutDraft["step"];

export function checkoutDraftKey(organizationId: string, branchId: string, employeeId: string) {
  return prefix + JSON.stringify([organizationId, branchId, employeeId]);
}

function parseDraft(value: string | null, now: number): CheckoutDraft | null {
  try {
    const parsed = draftSchema.safeParse(JSON.parse(value ?? "null"));
    return parsed.success &&
      parsed.data.expiresAt > now &&
      parsed.data.expiresAt <= now + checkoutDraftLifetimeMs
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

export function readCheckoutDraft(storage: Storage, key: string, now = Date.now()) {
  // Scan backwards because removing an entry moves subsequent keys.
  for (let i = storage.length - 1; i >= 0; i--) {
    const storedKey = storage.key(i);
    if (storedKey?.startsWith(prefix) && !parseDraft(storage.getItem(storedKey), now)) {
      storage.removeItem(storedKey);
    }
  }
  return parseDraft(storage.getItem(key), now);
}
