import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertBranchAccess, requireAuth } from "@/lib/auth";
import { jsonOk, jsonError, handleApiError } from "@/lib/api";
import {
  logAudit,
  releaseOrderReservations,
  StockError,
} from "@/lib/stock";
import { deleteOrderAndRelatedData } from "@/lib/order-delete";
import { resolveOrderItems } from "@/lib/orders";
import { sumOrderTotalAmount } from "@/lib/order-price";
import { z } from "zod";

const itemSchema = z
  .object({
    inventoryItemId: z.string().optional(),
    itemName: z.string().optional(),
    category: z.enum(["RAW_MATERIAL", "FINISHED_GOOD", "TRADING_ITEM"]).optional(),
    quantity: z.number().positive(),
    price: z.number().nonnegative().nullable().optional(),
  })
  .refine((i) => i.inventoryItemId || (i.itemName && i.itemName.trim()), {
    message: "Item ID or name required",
  });

const updateSchema = z.object({
  customerName: z.string().min(1).optional(),
  customerPhone: z.string().min(10).optional(),
  customerAddress: z.string().optional(),
  remarks: z.string().optional(),
  items: z.array(itemSchema).min(1).optional(),
  forceUpdate: z.boolean().optional(),
});

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
        createdBy: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
        items: { include: { inventoryItem: true } },
        reservations: {
          include: {
            inventoryItem: { select: { id: true, name: true, unit: true } },
            orderItem: { select: { itemNameSnapshot: true, unitSnapshot: true } },
          },
        },
        statusHistory: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    assertBranchAccess(user, order.branchId);
    return jsonOk({ order });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = updateSchema.parse(await req.json());

    const existing = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: { items: true },
    });

    assertBranchAccess(user, existing.branchId);

    if (!["DRAFT", "PENDING"].includes(existing.status)) {
      return jsonError("Only draft or pending orders can be edited", 400);
    }

    const resolvedItems = body.items ? await resolveOrderItems(body.items) : null;

    const order = await prisma.$transaction(async (tx) => {
      if (existing.status === "PENDING") {
        await releaseOrderReservations(tx, id, user.id);
      }

      if (resolvedItems) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });

        const createdItems = [];
        const orderItemsData = resolvedItems.map(({ inv, quantity, price }) => ({
          orderId: id,
          inventoryItemId: inv.id,
          category: inv.category,
          itemNameSnapshot: inv.name,
          unitSnapshot: inv.unit?.trim() || "—",
          quantity,
          price,
          lineTotal: price != null ? quantity * price : null,
        }));

        for (const itemData of orderItemsData) {
          const oi = await tx.orderItem.create({ data: itemData });
          createdItems.push(oi);
        }

        const totalAmount = sumOrderTotalAmount(
          orderItemsData.map((item) => ({
            quantity: Number(item.quantity),
            price: item.price,
          }))
        );

        return tx.order.update({
          where: { id },
          data: {
            customerName: body.customerName,
            customerPhone: body.customerPhone,
            customerAddress: body.customerAddress,
            remarks: body.remarks,
            totalAmount,
          },
          include: { items: true, reservations: true },
        });
      }

      return tx.order.update({
        where: { id },
        data: {
          customerName: body.customerName,
          customerPhone: body.customerPhone,
          customerAddress: body.customerAddress,
          remarks: body.remarks,
        },
        include: { items: true, reservations: true },
      });
    });

    await logAudit(user.id, "UPDATE", "Order", id, existing.branchId);
    return jsonOk({ order });
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, 400);
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    const existing = await prisma.order.findUniqueOrThrow({
      where: { id },
      select: { id: true, branchId: true, orderNumber: true, status: true },
    });
    assertBranchAccess(user, existing.branchId);

    await prisma.$transaction(async (tx) => {
      await deleteOrderAndRelatedData(tx, id, user.id);
    });

    await logAudit(user.id, "DELETE", "Order", id, existing.branchId, {
      orderNumber: existing.orderNumber,
      status: existing.status,
    });
    return jsonOk({ deleted: true, id });
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, 400);
    return handleApiError(error);
  }
}
