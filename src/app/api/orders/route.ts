import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertBranchAccess, requireAuth, resolveBranchId } from "@/lib/auth";
import { jsonOk, jsonError, handleApiError, parsePagination } from "@/lib/api";
import {
  generateOrderNumber,
  logAudit,
  logOrderStatus,
  StockError,
} from "@/lib/stock";
import { OrderStatus } from "@prisma/client";
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

const createSchema = z.object({
  branchId: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(10),
  customerAddress: z.string().optional(),
  remarks: z.string().optional(),
  status: z.enum(["DRAFT", "PENDING"]).optional(),
  items: z.array(itemSchema).min(1),
  forceCreate: z.boolean().optional(),
});

async function createOrderWithRetry<T>(
  branchId: string,
  createFn: (orderNumber: string) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const orderNumber = await generateOrderNumber(branchId);
    try {
      return await createFn(orderNumber);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        attempt < maxRetries - 1
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Failed to create order after retries");
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parsePagination(searchParams);

    const branchIdParam = searchParams.get("branchId");
    const status = searchParams.get("status") as OrderStatus | null;
    const search = searchParams.get("search") || "";
    const customerPhone = searchParams.get("customerPhone");
    const day = searchParams.get("day");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const branchId =
      user.role === "ADMIN" && branchIdParam
        ? branchIdParam
        : user.role === "ADMIN"
          ? undefined
          : user.branchId!;

    if (branchId) assertBranchAccess(user, branchId);

    const isSqlite = process.env.DATABASE_URL?.startsWith("file:");
    const searchFilter = search
      ? isSqlite
        ? {
            OR: [
              { orderNumber: { contains: search } },
              { customerName: { contains: search } },
              { customerPhone: { contains: search } },
            ],
          }
        : {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" as const } },
              { customerName: { contains: search, mode: "insensitive" as const } },
              { customerPhone: { contains: search, mode: "insensitive" as const } },
            ],
          }
      : {};

    let createdAtFilter: { gte?: Date; lt?: Date; lte?: Date } | undefined;
    if (day && month && year) {
      const d = parseInt(day, 10);
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);
      if (!Number.isNaN(d) && !Number.isNaN(m) && !Number.isNaN(y)) {
        createdAtFilter = {
          gte: new Date(y, m - 1, d),
          lt: new Date(y, m - 1, d + 1),
        };
      }
    } else if (month && year) {
      const m = parseInt(month, 10);
      const y = parseInt(year, 10);
      if (!Number.isNaN(m) && !Number.isNaN(y)) {
        createdAtFilter = {
          gte: new Date(y, m - 1, 1),
          lt: new Date(y, m, 1),
        };
      }
    } else if (year) {
      const y = parseInt(year, 10);
      if (!Number.isNaN(y)) {
        createdAtFilter = {
          gte: new Date(y, 0, 1),
          lt: new Date(y + 1, 0, 1),
        };
      }
    } else if (dateFrom || dateTo) {
      createdAtFilter = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }

    const where = {
      ...(branchId ? { branchId } : {}),
      ...(status ? { status } : {}),
      ...(customerPhone ? { customerPhone: { contains: customerPhone } } : {}),
      ...searchFilter,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          branch: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return jsonOk({ orders, total, page, limit });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = createSchema.parse(await req.json());
    const branchId = resolveBranchId(user, body.branchId);
    assertBranchAccess(user, branchId);

    const resolvedItems = await resolveOrderItems(body.items);

    const status = body.status || "PENDING";

    const order = await createOrderWithRetry(branchId, async (orderNumber) =>
      prisma.$transaction(async (tx) => {
        const orderItemsData = resolvedItems.map(({ inv, quantity, price }) => ({
          inventoryItemId: inv.id,
          category: inv.category,
          itemNameSnapshot: inv.name,
          unitSnapshot: inv.unit?.trim() || "—",
          quantity,
          price,
          lineTotal: price != null ? price : null,
        }));

        const totalAmount = sumOrderTotalAmount(
          orderItemsData.map((item) => ({
            price: item.price,
          }))
        );

        const newOrder = await tx.order.create({
          data: {
            branchId,
            orderNumber,
            customerName: body.customerName,
            customerPhone: body.customerPhone,
            customerAddress: body.customerAddress,
            remarks: body.remarks,
            status,
            totalAmount,
            createdByUserId: user.id,
            items: { create: orderItemsData },
          },
          include: { items: true },
        });

        await logOrderStatus(tx, newOrder.id, null, status, user.id, "Order created");
        return newOrder;
      })
    );

    await logAudit(user.id, "CREATE", "Order", order.id, branchId);
    return jsonOk({ order }, 201);
  } catch (error) {
    if (error instanceof StockError) return jsonError(error.message, 400);
    return handleApiError(error);
  }
}
