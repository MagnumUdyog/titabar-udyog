import type { Prisma } from "@prisma/client";

export async function deleteBranchAndRelatedData(
  tx: Prisma.TransactionClient,
  branchId: string
) {
  const branchUsers = await tx.user.findMany({
    where: { branchId },
    select: { id: true },
  });
  const branchUserIds = branchUsers.map((user) => user.id);

  await tx.manualLowStockAlert.deleteMany({ where: { branchId } });

  await tx.order.deleteMany({ where: { branchId } });

  await tx.stockMovement.deleteMany({ where: { branchId } });
  await tx.stockBalance.deleteMany({ where: { branchId } });

  await tx.inventoryImportBatch.deleteMany({
    where:
      branchUserIds.length > 0
        ? { OR: [{ branchId }, { importedByUserId: { in: branchUserIds } }] }
        : { branchId },
  });

  await tx.auditLog.deleteMany({
    where:
      branchUserIds.length > 0
        ? { OR: [{ branchId }, { userId: { in: branchUserIds } }] }
        : { branchId },
  });

  if (branchUserIds.length > 0) {
    await tx.user.deleteMany({ where: { id: { in: branchUserIds } } });
  }

  await tx.branch.delete({ where: { id: branchId } });
}
