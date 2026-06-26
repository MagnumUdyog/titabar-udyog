import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { AuthError, requireMasterListAccess } from "@/lib/auth";
import { jsonOk, handleApiError } from "@/lib/api";
import { logAudit } from "@/lib/stock";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  subHeading: z.string().optional(),
  unit: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  moq: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireMasterListAccess();
    const { id } = await params;
    const body = updateSchema.parse(await req.json());
    if (body.moq !== undefined && user.role !== "ADMIN") {
      throw new AuthError("Admin access required", 403);
    }
    const data = {
      ...body,
      ...(body.unit !== undefined ? { unit: body.unit?.trim() || null } : {}),
    };
    const item = await prisma.inventoryItem.update({ where: { id }, data });
    await logAudit(user.id, "UPDATE", "InventoryItem", id, undefined, body);
    return jsonOk({ item });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireMasterListAccess();
    const { id } = await params;
    const item = await prisma.inventoryItem.update({
      where: { id },
      data: { isActive: false },
    });
    await logAudit(user.id, "DEACTIVATE", "InventoryItem", id);
    return jsonOk({ item });
  } catch (error) {
    return handleApiError(error);
  }
}
