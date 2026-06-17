import { StockCategory } from "@prisma/client";

export function buildStockItemSearchFilter(
  search: string,
  isSqlite: boolean
): Record<string, unknown> {
  if (!search) return {};

  if (isSqlite) {
    return {
      OR: [
        { name: { contains: search } },
        { subHeading: { contains: search } },
      ],
    };
  }

  return {
    OR: [
      { name: { contains: search, mode: "insensitive" as const } },
      { subHeading: { contains: search, mode: "insensitive" as const } },
    ],
  };
}

export function buildMovementWhere(params: {
  branchId: string;
  category?: StockCategory | null;
  itemId?: string | null;
  search?: string;
  month?: string | null;
  year?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  isSqlite: boolean;
}): Record<string, unknown> {
  const {
    branchId,
    category,
    itemId,
    search = "",
    month,
    year,
    dateFrom,
    dateTo,
    isSqlite,
  } = params;

  const searchFilter = buildStockItemSearchFilter(search, isSqlite);
  const movementFilter: Record<string, unknown> = { branchId };

  if (category) movementFilter.category = category;
  if (itemId) movementFilter.inventoryItemId = itemId;
  if (search) {
    movementFilter.inventoryItem = searchFilter;
  }

  if (month && year) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    movementFilter.createdAt = {
      gte: new Date(y, m - 1, 1),
      lt: new Date(y, m, 1),
    };
  } else if (year) {
    const y = parseInt(year, 10);
    if (!Number.isNaN(y)) {
      movementFilter.createdAt = {
        gte: new Date(y, 0, 1),
        lt: new Date(y + 1, 0, 1),
      };
    }
  } else if (dateFrom || dateTo) {
    movementFilter.createdAt = {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  return movementFilter;
}

export function parseStocksPagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const exportAll = searchParams.get("export") === "true";
  const maxLimit = exportAll ? 2000 : 100;
  const defaultLimit = exportAll ? 2000 : 50;
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(searchParams.get("limit") || String(defaultLimit), 10))
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function parseMovementsPagination(searchParams: URLSearchParams) {
  const exportAll = searchParams.get("export") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const maxLimit = exportAll ? 2000 : 100;
  const defaultLimit = exportAll ? 2000 : 20;
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(searchParams.get("limit") || String(defaultLimit), 10))
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
