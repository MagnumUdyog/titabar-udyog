import { getSession, hasMasterListAccess } from "@/lib/auth";
import { jsonOk, jsonError, handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const user = await getSession();
    if (!user) return jsonError("Unauthorized", 401);
    const masterListUnlocked = await hasMasterListAccess(user);
    return jsonOk({ user, masterListUnlocked });
  } catch (error) {
    return handleApiError(error);
  }
}
