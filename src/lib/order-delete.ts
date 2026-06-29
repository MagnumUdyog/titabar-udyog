import type { Prisma } from "@prisma/client";
import { releaseOrderReservations, recordMovement } from "./stock";
import { toNumber } from "./utils";

export async function deleteOrderAndRelatedData(
  tx: Prisma.TransactionClient,
  orderId: string,
  userId: string
) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });

  if (order.status === "PENDING" || order.status === "DRAFT") {
    await releaseOrderReservations(tx, orderId, userId);
  } else if (order.status === "SUBMITTED") {
    for (const item of order.items) {
      const quantity = toNumber(item.quantity);
      await recordMovement(tx, {
        branchId: order.branchId,
        inventoryItemId: item.inventoryItemId,
        category: item.category,
        movementType: "IN",
        quantity,
        referenceType: "ADJUSTMENT",
        referenceId: orderId,
        note: "Order deleted - stock restored",
        createdByUserId: userId,
        balanceDelta: { onHand: quantity },
      });
    }
  }

  await tx.order.delete({ where: { id: orderId } });
  return order;
}
