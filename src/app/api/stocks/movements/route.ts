import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assertBranchAccess, requireAuth, resolveBranchId } from "@/lib/auth";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  buildMovementWhere,
  parseMovementsPagination,
} from "@/lib/stock-movement-filters";
import { StockCategory } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parseMovementsPagination(searchParams);

    const branchId = resolveBranchId(user, searchParams.get("branchId"));
    assertBranchAccess(user, branchId);

    const isSqlite = process.env.DATABASE_URL?.startsWith("file:") ?? false;
    const movementFilter = buildMovementWhere({
      branchId,
      category: searchParams.get("category") as StockCategory | null,
      itemId: searchParams.get("itemId"),
      search: searchParams.get("search") || "",
      month: searchParams.get("month"),
      year: searchParams.get("year"),
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
      isSqlite,
    });

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where: movementFilter,
        include: {
          inventoryItem: { select: { id: true, name: true, unit: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.stockMovement.count({ where: movementFilter }),
    ]);

    return jsonOk({
      movements,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
