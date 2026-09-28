import { ZodError } from "zod";

import { AuthenticationRequiredError } from "@/server/auth/session";
import { AuthorizationDeniedError } from "@/server/authorization/guard";
import { AcquisitionChannelRequiredError, AcquisitionChannelUnavailableError } from "./creation";
import { InvalidPhoneNumberError } from "./phone";
import type { StaffCustomerWorkflow } from "./staff-workflow";

type ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

function errorResponse(status: number, code: string, message: string) {
  const body: ErrorResponse = { error: { code, message } };
  return Response.json(body, { status });
}

function responseForError(error: unknown) {
  if (error instanceof AuthenticationRequiredError) {
    return errorResponse(401, error.code, error.message);
  }

  if (error instanceof AuthorizationDeniedError) {
    return errorResponse(403, error.code, error.message);
  }

  if (
    error instanceof ZodError ||
    error instanceof InvalidPhoneNumberError ||
    error instanceof AcquisitionChannelRequiredError ||
    error instanceof AcquisitionChannelUnavailableError
  ) {
    const code = "code" in error && typeof error.code === "string" ? error.code : "INVALID_REQUEST";
    const message = error instanceof ZodError ? "Request is invalid." : error.message;
    return errorResponse(400, code, message);
  }

  return errorResponse(500, "INTERNAL_ERROR", "The request could not be completed.");
}

function hasValidMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function createStaffCustomerRouteHandlers(workflow: StaffCustomerWorkflow) {
  return {
    async GET(request: Request) {
      try {
        const url = new URL(request.url);
        const result = await workflow.lookup(Object.fromEntries(url.searchParams));
        return Response.json(result);
      } catch (error) {
        return responseForError(error);
      }
    },

    async POST(request: Request) {
      if (!hasValidMutationOrigin(request)) {
        return errorResponse(403, "CSRF_VALIDATION_FAILED", "The request origin is invalid.");
      }

      let input: unknown;

      try {
        input = await request.json();
      } catch {
        return errorResponse(400, "INVALID_REQUEST", "Request is invalid.");
      }

      try {
        const result = await workflow.create(input);
        return Response.json(result, { status: result.isNewCustomer ? 201 : 200 });
      } catch (error) {
        return responseForError(error);
      }
    }
  };
}
