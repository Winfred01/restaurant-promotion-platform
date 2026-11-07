import { ZodError } from "zod";

import { InvalidPhoneNumberError, type PublicClaimInput } from "./public-claim";

type PublicClaimService = { claim(input: PublicClaimInput): Promise<void> };

const accepted = {
  message: "Request received. Ask restaurant staff about your promotion at checkout."
};
const noStore = { "Cache-Control": "no-store" };

async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) {
    throw new Error("Missing request body");
  }

  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
        throw new Error("Request body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
}

function response(status: number, body: object) {
  return Response.json(body, { status, headers: noStore });
}

export function createPublicClaimRouteHandler(service: PublicClaimService) {
  return async function POST(request: Request) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      return response(403, { error: "This request cannot be accepted." });
    }

    let input: unknown;
    try {
      input = await readJson(request);
    } catch {
      return response(400, { error: "Enter a valid phone number." });
    }

    try {
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return response(400, { error: "Enter a valid phone number." });
      }
      const supplied = input as Record<string, unknown>;
      await service.claim({
        organizationId: supplied.organizationId as string,
        branchId: supplied.branchId as string,
        promotionId: supplied.promotionId as string,
        phoneNumber: supplied.phoneNumber as string,
        remoteAddress:
          (process.env.VERCEL === "1" &&
            request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()) ||
          "unknown"
      });
      return response(202, accepted);
    } catch (error) {
      if (error instanceof ZodError || error instanceof InvalidPhoneNumberError) {
        return response(400, { error: "Enter a valid phone number." });
      }
      return response(503, { error: "This request is temporarily unavailable." });
    }
  };
}
