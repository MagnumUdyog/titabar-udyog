import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireMasterListAccess } from "@/lib/auth";
import { jsonOk, handleApiError, parsePagination } from "@/lib/api";
import { logAudit } from "@/lib/stock";
import { StockCategory } from "@prisma/client";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["RAW_MATERIAL", "FINISHED_GOOD", "TRADING_ITEM"]),
  subHeading: z.string().optional(),
  unit: z.string().optional().nullable(),
  sku: z.string().optional(),
  moq: z.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireMasterListAccess();
    const { searchParams } = new URL(req.url);
    const { page, limit, skip } = parsePagination(searchParams);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") as StockCategory | null;
    const activeOnly = searchParams.get("activeOnly") !== "false";
    const isSqlite = process.env.DATABASE_URL?.startsWith("file:");

    const where: Record<string, unknown> = {
      ...(category ? { category } : {}),
      ...(activeOnly ? { isActive: true } : {}),
    };

    if (search) {
      if (isSqlite) {
        where.OR = [
          { name: { contains: search } },
          { subHeading: { contains: search } },
        ];
      } else {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { subHeading: { contains: search, mode: "insensitive" } },
        ];
      }
    }

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        orderBy: [{ category: "asc" }, { subHeading: "asc" }, { name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    return jsonOk({ items, total, page, limit });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireMasterListAccess();
    const body = createSchema.parse(await req.json());
    const item = await prisma.inventoryItem.create({
      data: {
        name: body.name,
        category: body.category,
        subHeading: body.subHeading || "GENERAL",
        unit: body.unit?.trim() || null,
        sku: body.sku,
        moq: body.moq ?? 0,
      },
    });
    await logAudit(user.id, "CREATE", "InventoryItem", item.id, undefined, body);
    return jsonOk({ item }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
