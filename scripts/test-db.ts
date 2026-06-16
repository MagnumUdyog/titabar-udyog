import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  const items = await prisma.inventoryItem.count();
  const balances = await prisma.stockBalance.count();
  console.log({ users, items, balances, url: process.env.DATABASE_URL?.slice(0, 40) + "..." });
}

main()
  .catch((e) => {
    console.error("CONNECTION_ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
