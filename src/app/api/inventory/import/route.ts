import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { jsonError, handleApiError } from "@/lib/api";
import { parseInventoryExcel, type ImportRow } from "@/lib/excel";
import { logAudit } from "@/lib/stock";
import { StockCategory } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 25;
const PROGRESS_EVERY = 10;

type ImportError = { rowNumber: number; message: string; itemName?: string };

function itemKey(category: StockCategory, name: string) {
  return `${category}::${name}`;
}

async function clearMasterList() {
  await prisma.$transaction(async (tx) => {
    await tx.orderStockReservation.deleteMany();
    await tx.stockMovement.deleteMany();
    await tx.stockBalance.deleteMany();

    const used = await tx.orderItem.findMany({
      select: { inventoryItemId: true },
      distinct: ["inventoryItemId"],
    });
    const usedIds = used.map((r) => r.inventoryItemId);

    if (usedIds.length > 0) {
      await tx.inventoryItem.deleteMany({ where: { id: { notIn: usedIds } } });
      await tx.inventoryItem.updateMany({
        where: { id: { in: usedIds } },
        data: { isActive: false },
      });
    } else {
      await tx.inventoryItem.deleteMany();
    }
  });
}

async function importRows(
  rows: ImportRow[],
  onProgress?: (current: number, total: number) => void
): Promise<{ successRows: number; importErrors: ImportError[] }> {
  const existing = await prisma.inventoryItem.findMany({
    select: { id: true, name: true, category: true },
  });
  const existingByKey = new Map(
    existing.map((item) => [itemKey(item.category, item.name), item])
  );

  const importErrors: ImportError[] = [];
  let successRows = 0;
  const total = rows.length;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    try {
      await prisma.$transaction(async (tx) => {
        for (const row of batch) {
          const key = itemKey(row.category, row.name);
          const match = existingByKey.get(key);

          if (match) {
            await tx.inventoryItem.update({
              where: { id: match.id },
              data: {
                subHeading: row.subHeading,
                unit: row.unit,
                moq: 0,
                isActive: true,
              },
            });
          } else {
            const created = await tx.inventoryItem.create({
              data: {
                name: row.name,
                category: row.category,
                subHeading: row.subHeading,
                unit: row.unit,
                moq: 0,
                isActive: true,
              },
            });
            existingByKey.set(key, created);
          }
          successRows++;
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const row of batch) {
        importErrors.push({
          rowNumber: row.rowNumber,
          itemName: row.name,
          message,
        });
      }
    }

    const current = Math.min(i + batch.length, total);
    if (onProgress && (current % PROGRESS_EVERY === 0 || current === total)) {
      onProgress(current, total);
    }
  }

  return { successRows, importErrors };
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin();
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) || "replace";
    const branchId = (formData.get("branchId") as string) || undefined;
    const stream = formData.get("stream") === "true";

    if (!file) return jsonError("No file uploaded");

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors: parseErrors } = parseInventoryExcel(buffer);

    if (rows.length === 0) {
      return jsonError(parseErrors[0]?.message || "No valid rows in file");
    }

    if (!stream) {
      if (mode === "replace") await clearMasterList();

      const { successRows, importErrors } = await importRows(rows);
      const allErrors = [...parseErrors, ...importErrors];

      const batchCategory: StockCategory = rows[0]?.category ?? "TRADING_ITEM";
      const batch = await prisma.inventoryImportBatch.create({
        data: {
          category: batchCategory,
          fileName: file.name,
          importedByUserId: user.id,
          branchId,
          totalRows: rows.length,
          successRows,
          failedRows: allErrors.length,
        },
      });

      await logAudit(user.id, "IMPORT", "InventoryImportBatch", batch.id, branchId, {
        fileName: file.name,
        successRows,
        failedRows: allErrors.length,
        mode,
      });

      return Response.json({
        done: true,
        successRows,
        failedRows: allErrors.length,
        errors: allErrors,
        batch,
      });
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          if (mode === "replace") await clearMasterList();

          const { successRows, importErrors } = await importRows(rows, (current, total) => {
            send({
              current,
              total,
              percent: Math.round((current / total) * 100),
            });
          });

          const allErrors = [...parseErrors, ...importErrors];
          const batchCategory: StockCategory = rows[0]?.category ?? "TRADING_ITEM";
          const batch = await prisma.inventoryImportBatch.create({
            data: {
              category: batchCategory,
              fileName: file.name,
              importedByUserId: user.id,
              branchId,
              totalRows: rows.length,
              successRows,
              failedRows: allErrors.length,
            },
          });

          await logAudit(user.id, "IMPORT", "InventoryImportBatch", batch.id, branchId, {
            fileName: file.name,
            successRows,
            failedRows: allErrors.length,
            mode,
          });

          send({
            done: true,
            successRows,
            failedRows: allErrors.length,
            errors: allErrors,
            batch,
          });
        } catch (err) {
          send({ error: errMsg(err) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
