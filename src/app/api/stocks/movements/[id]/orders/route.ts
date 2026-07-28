import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertBranchAccess, requireAuth } from "@/lib/auth";
import { jsonOk, handleApiError } from "@/lib/api";
import { getMovementOrderContext } from "@/lib/movement-orders";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const movement = await prisma.stockMovement.findUniqueOrThrow({
      where: { id },
      select: { branchId: true },
    });
    assertBranchAccess(user, movement.branchId);

    const result = await getMovementOrderContext(id);
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
