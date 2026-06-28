import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { jsonOk, jsonError, handleApiError } from "@/lib/api";
import { logAudit } from "@/lib/stock";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().min(2).max(10).optional(),
  phone: z.string().min(10).optional(),
  isActive: z.boolean().optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(4).optional(),
});

function mapBranchWithUser<T extends { users: Array<{ id: string; name: string; phone: string; isActive: boolean }> }>(
  branch: T
) {
  const { users, ...rest } = branch;
  return { ...rest, branchUser: users[0] ?? null };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = updateSchema.parse(await req.json());

    const { username, password, ...branchFields } = body;
    if (branchFields.code) {
      branchFields.code = branchFields.code.toUpperCase();
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id },
        data: branchFields,
      });

      const loginName = username?.trim() || updated.name;
      const loginPhone = updated.phone?.trim();

      let branchUser = await tx.user.findFirst({
        where: { branchId: id, role: "BRANCH_USER" },
        orderBy: { createdAt: "asc" },
      });

      if (branchUser) {
        const userData: Record<string, unknown> = {
          name: loginName,
        };
        if (loginPhone) userData.phone = loginPhone;
        if (password) userData.passwordHash = await hashPassword(password);
        if (body.isActive !== undefined) userData.isActive = body.isActive;

        branchUser = await tx.user.update({
          where: { id: branchUser.id },
          data: userData,
        });
      } else if (loginPhone) {
        if (!password) {
          throw new Error("Password is required to create branch login");
        }
        branchUser = await tx.user.create({
          data: {
            name: loginName,
            phone: loginPhone,
            passwordHash: await hashPassword(password),
            role: "BRANCH_USER",
            branchId: id,
            isActive: updated.isActive,
          },
        });
      }

      const branchWithUser = await tx.branch.findUniqueOrThrow({
        where: { id },
        include: {
          users: {
            where: { role: "BRANCH_USER" },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { id: true, name: true, phone: true, isActive: true },
          },
        },
      });

      return mapBranchWithUser(branchWithUser);
    });

    await logAudit(admin.id, "UPDATE", "Branch", id, id, body);
    return jsonOk({ branch: result });
  } catch (error) {
    if (error instanceof Error && error.message === "Password is required to create branch login") {
      return jsonError(error.message, 400);
    }
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;

    const branch = await prisma.$transaction(async (tx) => {
      const updated = await tx.branch.update({
        where: { id },
        data: { isActive: false },
      });

      await tx.user.updateMany({
        where: { branchId: id, role: "BRANCH_USER" },
        data: { isActive: false },
      });

      return updated;
    });

    await logAudit(admin.id, "DEACTIVATE", "Branch", id, id);
    return jsonOk({ branch });
  } catch (error) {
    return handleApiError(error);
  }
}
