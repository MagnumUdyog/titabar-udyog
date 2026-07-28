import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertBranchAccess, requireAuth, resolveBranchId } from "@/lib/auth";
import { jsonOk, jsonError, handleApiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const branchId = resolveBranchId(user, searchParams.get("branchId"));
    const itemId = searchParams.get("itemId");

    if (!itemId) {
      return jsonError("itemId is required", 400);
    }

    assertBranchAccess(user, branchId);

    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, name: true, unit: true, category: true },
    });

    if (!item) {
      return jsonError("Item not found", 404);
    }

    const orderItems = await prisma.orderItem.findMany({
      where: {
        inventoryItemId: itemId,
        order: {
          branchId,
          status: "PENDING",
        },
      },
      select: {
        quantity: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            status: true,
            createdAt: true,
            createdBy: { select: { name: true } },
          },
        },
      },
      orderBy: { order: { createdAt: "desc" } },
    });

    const reservations = orderItems.map((oi) => ({
      orderId: oi.order.id,
      orderNumber: oi.order.orderNumber,
      customerName: oi.order.customerName,
      customerPhone: oi.order.customerPhone,
      quantity: Number(oi.quantity),
      orderStatus: oi.order.status,
      createdAt: oi.order.createdAt.toISOString(),
      createdBy: oi.order.createdBy.name,
    }));

    const totalReserved = reservations.reduce((sum, r) => sum + r.quantity, 0);

    return jsonOk({
      item,
      totalReserved,
      reservations,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
