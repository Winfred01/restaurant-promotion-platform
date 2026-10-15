import { ZodError } from "zod";

import { AuthenticationRequiredError } from "@/server/auth/session";
import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { PromotionEligibilityUnavailableError } from "@/server/promotions/eligibility";
import {
  RedemptionConflictError,
  RedemptionIneligibleError,
  RedemptionUnavailableError
} from "./checkout";
import type { StaffCheckoutWorkflow } from "./staff-checkout";

function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}

function responseForError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return failure(401, error.code, error.message);
  if (error instanceof AuthorizationDeniedError) return failure(403, error.code, error.message);
  if (error instanceof ZodError)
    return failure(400, "INVALID_REQUEST", "Check the checkout fields.");
  if (
    error instanceof PromotionEligibilityUnavailableError ||
    error instanceof RedemptionUnavailableError
  )
    return failure(
      404,
      "CONTEXT_UNAVAILABLE",
      "Customer or promotion is unavailable. Refresh and try again."
    );
  if (error instanceof RedemptionIneligibleError)
    return failure(
      409,
      "PROMOTION_INELIGIBLE",
      "This promotion is no longer eligible. Refresh the quote."
    );
  if (error instanceof RedemptionConflictError)
    return failure(409, "REDEMPTION_CONFLICT", error.message);
  return failure(500, "INTERNAL_ERROR", "Checkout could not be completed.");
}

export function createStaffCheckoutRouteHandler(workflow: StaffCheckoutWorkflow) {
  return async function POST(request: Request) {
    const origin = request.headers.get("origin");
    try {
      if (!origin || new URL(origin).origin !== new URL(request.url).origin) {
        return failure(403, "CSRF_VALIDATION_FAILED", "The request origin is invalid.");
      }
    } catch {
      return failure(403, "CSRF_VALIDATION_FAILED", "The request origin is invalid.");
    }

    try {
      const body: unknown = await request.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return failure(400, "INVALID_REQUEST", "Check the checkout fields.");
      }
      const { action, ...input } = body as Record<string, unknown>;
      if (action === "quote") return Response.json(await workflow.quote(input));
      if (action === "redeem") return Response.json(await workflow.redeem(input), { status: 201 });
      return failure(400, "INVALID_REQUEST", "Check the checkout fields.");
    } catch (error) {
      return responseForError(error);
    }
  };
}
