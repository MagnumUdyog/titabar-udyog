import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, requireAdmin, requireAuth } from "@/lib/auth";
import { jsonOk, handleApiError } from "@/lib/api";
import { logAudit } from "@/lib/stock";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(2).max(10),
  phone: z.string().min(10),
  username: z.string().min(1),
  password: z.string().min(4),
});

function mapBranchWithUser<T extends { users: Array<{ id: string; name: string; phone: string; isActive: boolean }> }>(
  branch: T
) {
  const { users, ...rest } = branch;
  return { ...rest, branchUser: users[0] ?? null };
}

export async function GET() {
  try {
    const user = await requireAuth();
    const branches = await prisma.branch.findMany({
      where:
        user.role === "ADMIN"
          ? {}
          : { id: user.branchId ?? undefined, isActive: true },
      orderBy: { name: "asc" },
      include: {
        users: {
          where: { role: "BRANCH_USER" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { id: true, name: true, phone: true, isActive: true },
        },
      },
    });
    return jsonOk({
      branches: branches.map(mapBranchWithUser),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = createSchema.parse(await req.json());

    const branch = await prisma.$transaction(async (tx) => {
      const created = await tx.branch.create({
        data: {
          name: body.name,
          code: body.code.toUpperCase(),
          phone: body.phone,
        },
      });

      const passwordHash = await hashPassword(body.password);
      await tx.user.create({
        data: {
          name: body.username,
          phone: body.phone,
          passwordHash,
          role: "BRANCH_USER",
          branchId: created.id,
        },
      });

      return created;
    });

    await logAudit(admin.id, "CREATE", "Branch", branch.id, branch.id, {
      name: body.name,
      code: body.code,
      username: body.username,
    });
    return jsonOk({ branch }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
