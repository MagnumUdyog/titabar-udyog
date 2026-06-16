import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.manualLowStockAlert.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.orderStockReservation.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.stockBalance.deleteMany();
  await prisma.inventoryImportBatch.deleteMany();
  await prisma.inventoryItem.deleteMany();

  console.log("All inventory, stock, orders, and movements cleared.");
  console.log("Users and branches were kept.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
