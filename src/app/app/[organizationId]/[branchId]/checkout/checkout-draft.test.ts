import { describe, expect, it } from "vitest";

import { checkoutDraftKey, checkoutDraftLifetimeMs, readCheckoutDraft } from "./checkout-draft";

function sessionStorageFixture(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear()
  };
}

const key = checkoutDraftKey("org", "downtown", "staff");
const draft = {
  phone: "+14165550103",
  step: 4,
  channelId: "",
  subtotal: "43.20",
  receipt: "TEST-100",
  selected: "offer-1",
  expiresAt: 100 + checkoutDraftLifetimeMs
};

describe("checkout draft", () => {
  it("restores only the matching organization, branch and employee scope", () => {
    const storage = sessionStorageFixture();
    storage.setItem(key, JSON.stringify({ ...draft, offers: [{ discountCents: 200 }] }));
    expect(readCheckoutDraft(storage, key, 100)).toEqual(draft);
    for (const foreign of [
      checkoutDraftKey("other", "downtown", "staff"),
      checkoutDraftKey("org", "riverside", "staff"),
      checkoutDraftKey("org", "downtown", "other")
    ]) {
      expect(readCheckoutDraft(storage, foreign, 100)).toBeNull();
    }
  });

  it("removes expired and malformed drafts while preserving unrelated session data", () => {
    const storage = sessionStorageFixture();
    const other = checkoutDraftKey("org", "riverside", "staff");
    storage.setItem(key, JSON.stringify(draft));
    storage.setItem(other, "invalid json");
    storage.setItem("staff-checkout:v0:previous", JSON.stringify(draft));
    storage.setItem("unrelated", "keep");
    expect(readCheckoutDraft(storage, key, draft.expiresAt)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
    expect(storage.getItem(other)).toBeNull();
    expect(storage.getItem("staff-checkout:v0:previous")).toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
  });

  it("restores an unconfirmed attempt only within its draft lifetime", () => {
    const storage = sessionStorageFixture();
    const attempted = { ...draft, redemptionPending: true };
    storage.setItem(key, JSON.stringify(attempted));
    expect(readCheckoutDraft(storage, key, 100)).toEqual(attempted);
    expect(readCheckoutDraft(storage, key, attempted.expiresAt)).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });
});
