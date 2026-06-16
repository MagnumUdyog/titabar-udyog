import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12);

  const mainBranch = await prisma.branch.upsert({
    where: { code: "MAIN" },
    update: {},
    create: {
      name: "Main Factory",
      code: "MAIN",
      address: "Titiabar, Assam",
      phone: "9876543210",
    },
  });

  const branch2 = await prisma.branch.upsert({
    where: { code: "BR02" },
    update: {},
    create: {
      name: "Branch 2",
      code: "BR02",
      address: "Guwahati",
      phone: "9876543211",
    },
  });

  await prisma.user.upsert({
    where: { phone: "9999999999" },
    update: { passwordHash, isActive: true },
    create: {
      name: "Admin",
      phone: "9999999999",
      passwordHash,
      role: "ADMIN",
    },
  });

  const branchPassword = await bcrypt.hash("branch123", 12);
  await prisma.user.upsert({
    where: { phone: "8888888888" },
    update: { passwordHash: branchPassword, isActive: true, branchId: mainBranch.id },
    create: {
      name: "Main Branch User",
      phone: "8888888888",
      passwordHash: branchPassword,
      role: "BRANCH_USER",
      branchId: mainBranch.id,
    },
  });

  console.log("Seed complete!");
  console.log("Admin login: 9999999999 / admin123");
  console.log("Branch user: 8888888888 / branch123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
