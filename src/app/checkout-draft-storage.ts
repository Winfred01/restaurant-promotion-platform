export const checkoutDraftNamespace = "staff-checkout:";

export function clearTabCheckoutDrafts() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(checkoutDraftNamespace)) sessionStorage.removeItem(key);
    }
  } catch {
    // Authentication must still work if this browser blocks tab storage.
  }
}
