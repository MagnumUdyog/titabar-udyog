import { NextRequest } from "next/server";
import { requireAuth, unlockMasterListWithAdminPassword } from "@/lib/auth";
import { jsonOk, jsonError, handleApiError } from "@/lib/api";
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
    const ok = await unlockMasterListWithAdminPassword(body.password);
    if (!ok) {
      return jsonError("Incorrect admin password", 401);
    }

    return jsonOk({ unlocked: true });
  } catch (error) {
    return handleApiError(error);
  }
}
