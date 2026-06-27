import { NextRequest } from "next/server";
import { createSession, verifyPassword, findUserByLogin } from "@/lib/auth";
import { jsonOk, jsonError, handleApiError } from "@/lib/api";
import { logAudit } from "@/lib/stock";
import { z } from "zod";

const schema = z.object({
  login: z.string().min(1),
  password: z.string().min(4),
});

export async function POST(req: NextRequest) {
  try {
    const body = schema.parse(await req.json());
    const user = await findUserByLogin(body.login);

    if (!user || !user.isActive) {
      return jsonError("Invalid phone/name or password", 401);
    }

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) return jsonError("Invalid phone/name or password", 401);

    const sessionUser = {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      branchId: user.branchId,
      branchName: user.branch?.name ?? null,
    };

    await createSession(sessionUser);
    try {
      await logAudit(user.id, "LOGIN", "User", user.id, user.branchId ?? undefined);
    } catch {
      // Login should succeed even if audit logging fails
    }

    return jsonOk({ user: sessionUser });
  } catch (error) {
    return handleApiError(error);
  }
}
