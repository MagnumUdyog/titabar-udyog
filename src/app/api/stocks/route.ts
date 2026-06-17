import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertBranchAccess, requireAuth, resolveBranchId } from "@/lib/auth";
import { jsonOk, handleApiError } from "@/lib/api";
import { buildStockItemSearchFilter, parseStocksPagination } from "@/lib/stock-movement-filters";
import { StockCategory } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parseStocksPagination(searchParams);

    const branchId = resolveBranchId(user, searchParams.get("branchId"));
    assertBranchAccess(user, branchId);

    const category = searchParams.get("category") as StockCategory | null;
    const itemId = searchParams.get("itemId");
    const search = searchParams.get("search") || "";
    const isSqlite = process.env.DATABASE_URL?.startsWith("file:") ?? false;
    const searchFilter = buildStockItemSearchFilter(search, isSqlite);

    const itemWhere = {
      isActive: true,
      ...(category ? { category } : {}),
      ...(itemId ? { id: itemId } : {}),
      ...searchFilter,
    };

    const branch = await prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
      select: { id: true, name: true, code: true },
    });

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: itemWhere,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.inventoryItem.count({ where: itemWhere }),
    ]);

    const itemIds = items.map((i) => i.id);
    const [balances, pendingReservedRows] = await Promise.all([
      prisma.stockBalance.findMany({
        where: {
          branchId,
          inventoryItemId: { in: itemIds },
        },
      }),
      itemIds.length > 0
        ? prisma.orderItem.groupBy({
            by: ["inventoryItemId"],
            where: {
              inventoryItemId: { in: itemIds },
              order: {
                branchId,
                status: "PENDING",
              },
            },
            _sum: { quantity: true },
          })
        : Promise.resolve([]),
    ]);

    const balanceMap = new Map(balances.map((b) => [b.inventoryItemId, b]));
    const pendingReservedMap = new Map(
      pendingReservedRows.map((row) => [row.inventoryItemId, Number(row._sum.quantity ?? 0)])
    );

    const mergedBalances = items.map((item) => {
      const bal = balanceMap.get(item.id);
      const onHandQty = Number(bal?.onHandQty ?? 0);
      const reservedQty = pendingReservedMap.get(item.id) ?? 0;
      return {
        id: bal?.id ?? item.id,
        branchId,
        inventoryItemId: item.id,
        category: item.category,
        onHandQty,
        reservedQty,
        availableQty: onHandQty - reservedQty,
        moq: item.moq,
        inventoryItem: item,
        branch,
      };
    });

    return jsonOk({ balances: mergedBalances, total, page, limit });
  } catch (error) {
    return handleApiError(error);
  }
}
