import {
  verifyMasterListPassword,
  createMasterListUnlockToken,
  attachMasterListUnlockCookie,
  requireAuth,
} from "@/lib/auth";
import { jsonOk, jsonError, handleApiError } from "@/lib/api";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    if (user.role === "ADMIN") {
      return jsonOk({ unlocked: true });
    }

    const body = schema.parse(await req.json());
    const ok = await verifyMasterListPassword(body.password);
    if (!ok) {
      return jsonError("Incorrect admin password", 401);
    }

    const response = jsonOk({ unlocked: true });
    const token = await createMasterListUnlockToken();
    attachMasterListUnlockCookie(response, token);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
