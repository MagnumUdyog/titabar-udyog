import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertBranchAccess, requireAuth } from "@/lib/auth";
import { jsonOk, handleApiError } from "@/lib/api";
import { toNumber } from "@/lib/utils";
import { priceFromDb } from "@/lib/order-price";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const order = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        branch: true,
        items: true,
        createdBy: { select: { name: true } },
        submittedBy: { select: { name: true } },
      },
    });

    assertBranchAccess(user, order.branchId);

    const challan = {
      orderNumber: order.orderNumber,
      status: order.status,
      branch: {
        name: order.branch.name,
        code: order.branch.code,
        address: order.branch.address,
        phone: order.branch.phone,
      },
      customer: {
        name: order.customerName,
        phone: order.customerPhone,
        address: order.customerAddress,
      },
      items: order.items.map((item) => ({
        name: item.itemNameSnapshot,
        unit: item.unitSnapshot,
        quantity: toNumber(item.quantity),
        price: priceFromDb(item.price),
        category: item.category,
      })),
      totalAmount: toNumber(order.totalAmount),
      remarks: order.remarks,
      createdAt: order.createdAt,
      submittedAt: order.submittedAt,
      createdBy: order.createdBy.name,
      submittedBy: order.submittedBy?.name,
    };

    return jsonOk({ challan });
  } catch (error) {
    return handleApiError(error);
  }
}
