import {
  MovementType,
  OrderStatus,
  Prisma,
  ReferenceType,
  StockCategory,
} from "@prisma/client";
import { prisma } from "./db";
import { toNumber } from "./utils";

type Tx = Prisma.TransactionClient;

export async function getOrCreateBalance(
  tx: Tx,
  branchId: string,
  inventoryItemId: string,
  category: StockCategory
) {
  const existing = await tx.stockBalance.findUnique({
    where: { branchId_inventoryItemId: { branchId, inventoryItemId } },
  });
  if (existing) return existing;

  return tx.stockBalance.create({
    data: {
      branchId,
      inventoryItemId,
      category,
      onHandQty: 0,
      reservedQty: 0,
      availableQty: 0,
    },
  });
}

async function updateBalance(
  tx: Tx,
  branchId: string,
  inventoryItemId: string,
  category: StockCategory,
  delta: { onHand?: number; reserved?: number },
  allowNegative = false
) {
  const balance = await getOrCreateBalance(tx, branchId, inventoryItemId, category);
  const onHand = toNumber(balance.onHandQty) + (delta.onHand ?? 0);
  const reserved = toNumber(balance.reservedQty) + (delta.reserved ?? 0);
  const available = onHand - reserved;

  if (!allowNegative && (onHand < 0 || reserved < 0 || available < 0)) {
    throw new StockError("Insufficient stock for this operation");
  }

  return tx.stockBalance.update({
    where: { id: balance.id },
    data: {
      onHandQty: onHand,
      reservedQty: reserved,
      availableQty: available,
    },
  });
}

export async function recordMovement(
  tx: Tx,
  params: {
    branchId: string;
    inventoryItemId: string;
    category: StockCategory;
    movementType: MovementType;
    quantity: number;
    referenceType: ReferenceType;
    referenceId?: string;
    note?: string;
    createdByUserId: string;
    balanceDelta: { onHand?: number; reserved?: number };
    allowNegative?: boolean;
  }
) {
  await updateBalance(
    tx,
    params.branchId,
    params.inventoryItemId,
    params.category,
    params.balanceDelta,
    params.allowNegative
  );

  return tx.stockMovement.create({
    data: {
      branchId: params.branchId,
      inventoryItemId: params.inventoryItemId,
      category: params.category,
      movementType: params.movementType,
      quantity: params.quantity,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      note: params.note,
      createdByUserId: params.createdByUserId,
    },
  });
}

export async function stockIn(
  branchId: string,
  inventoryItemId: string,
  category: StockCategory,
  quantity: number,
  userId: string,
  note?: string
) {
  return prisma.$transaction(async (tx) => {
    return recordMovement(tx, {
      branchId,
      inventoryItemId,
      category,
      movementType: "IN",
      quantity,
      referenceType: "MANUAL",
      note,
      createdByUserId: userId,
      balanceDelta: { onHand: quantity },
    });
  });
}

export async function stockOut(
  branchId: string,
  inventoryItemId: string,
  category: StockCategory,
  quantity: number,
  userId: string,
  note?: string,
  referenceType: ReferenceType = "MANUAL",
  referenceId?: string
) {
  return prisma.$transaction(async (tx) => {
    const balance = await getOrCreateBalance(tx, branchId, inventoryItemId, category);
    if (toNumber(balance.availableQty) < quantity) {
      throw new StockError("Insufficient available stock");
    }
    return recordMovement(tx, {
      branchId,
      inventoryItemId,
      category,
      movementType: "OUT",
      quantity,
      referenceType,
      referenceId,
      note,
      createdByUserId: userId,
      balanceDelta: { onHand: -quantity },
    });
  });
}

export async function stockAdjustment(
  branchId: string,
  inventoryItemId: string,
  category: StockCategory,
  newOnHandQty: number,
  userId: string,
  note?: string
) {
  return prisma.$transaction(async (tx) => {
    const balance = await getOrCreateBalance(tx, branchId, inventoryItemId, category);
    const current = toNumber(balance.onHandQty);
    const delta = newOnHandQty - current;
    if (delta === 0) return balance;

    if (newOnHandQty - toNumber(balance.reservedQty) < 0) {
      throw new StockError("Adjustment would make available stock negative");
    }

    await recordMovement(tx, {
      branchId,
      inventoryItemId,
      category,
      movementType: "ADJUSTMENT",
      quantity: Math.abs(delta),
      referenceType: "ADJUSTMENT",
      note: note || `Adjusted from ${current} to ${newOnHandQty}`,
      createdByUserId: userId,
      balanceDelta: { onHand: delta },
    });

    return getOrCreateBalance(tx, branchId, inventoryItemId, category);
  });
}

export interface StockCheckResult {
  inventoryItemId: string;
  requestedQty: number;
  availableQty: number;
  reservedByOthers: number;
  sufficient: boolean;
  warning?: string;
}

export interface OrderStockWarning {
  inventoryItemId: string;
  itemName: string;
  availableQty: number;
  requestedQty: number;
  moq: number;
  exceedsStock: boolean;
  lowStock: boolean;
}

export async function getItemsAvailableStock(
  branchId: string,
  inventoryItemIds: string[],
  excludeOrderId?: string
): Promise<Record<string, number>> {
  if (inventoryItemIds.length === 0) return {};
  const balances = await prisma.stockBalance.findMany({
    where: { branchId, inventoryItemId: { in: inventoryItemIds } },
    select: { inventoryItemId: true, availableQty: true },
  });
  const map: Record<string, number> = Object.fromEntries(
    inventoryItemIds.map((id) => [id, 0])
  );
  for (const b of balances) {
    map[b.inventoryItemId] = toNumber(b.availableQty);
  }

  if (excludeOrderId) {
    const ownRows = await prisma.orderStockReservation.groupBy({
      by: ["inventoryItemId"],
      where: {
        orderId: excludeOrderId,
        branchId,
        status: "ACTIVE",
        inventoryItemId: { in: inventoryItemIds },
      },
      _sum: { quantity: true },
    });
    for (const row of ownRows) {
      map[row.inventoryItemId] = (map[row.inventoryItemId] ?? 0) + toNumber(row._sum.quantity);
    }
  }

  return map;
}

export async function checkOrderStockWarnings(
  branchId: string,
  items: { inventoryItemId: string; quantity: number; itemName?: string }[],
  excludeOrderId?: string
): Promise<OrderStockWarning[]> {
  if (items.length === 0) return [];

  const itemIds = items.map((i) => i.inventoryItemId);
  const [availability, invItems] = await Promise.all([
    getItemsAvailableStock(branchId, itemIds, excludeOrderId),
    prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true, moq: true },
    }),
  ]);
  const invMap = new Map(invItems.map((inv) => [inv.id, inv]));
  const warnings: OrderStockWarning[] = [];

  for (const item of items) {
    const inv = invMap.get(item.inventoryItemId);
    const available = availability[item.inventoryItemId] ?? 0;
    const moq = inv?.moq ?? 0;
    const exceedsStock = item.quantity > available;
    const lowStock = available < moq;

    if (exceedsStock || lowStock) {
      warnings.push({
        inventoryItemId: item.inventoryItemId,
        itemName: item.itemName || inv?.name || "Unknown item",
        availableQty: available,
        requestedQty: item.quantity,
        moq,
        exceedsStock,
        lowStock,
      });
    }
  }

  return warnings;
}

export async function checkStockAvailability(
  branchId: string,
  items: { inventoryItemId: string; quantity: number }[],
  excludeOrderId?: string
): Promise<StockCheckResult[]> {
  if (items.length === 0) return [];

  const itemIds = items.map((i) => i.inventoryItemId);

  const [balances, otherReservations, ownReservations] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { branchId, inventoryItemId: { in: itemIds } },
    }),
    prisma.orderStockReservation.groupBy({
      by: ["inventoryItemId"],
      where: {
        branchId,
        inventoryItemId: { in: itemIds },
        status: "ACTIVE",
        ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
      },
      _sum: { quantity: true },
    }),
    excludeOrderId
      ? prisma.orderStockReservation.groupBy({
          by: ["inventoryItemId"],
          where: {
            orderId: excludeOrderId,
            branchId,
            inventoryItemId: { in: itemIds },
            status: "ACTIVE",
          },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
  ]);

  const balanceMap = new Map(balances.map((b) => [b.inventoryItemId, b]));
  const otherReservedMap = new Map(
    otherReservations.map((row) => [row.inventoryItemId, toNumber(row._sum.quantity)])
  );
  const ownReservedMap = new Map(
    ownReservations.map((row) => [row.inventoryItemId, toNumber(row._sum.quantity)])
  );

  return items.map((item) => {
    const balance = balanceMap.get(item.inventoryItemId);
    const available = balance ? toNumber(balance.availableQty) : 0;
    const reservedByOthers = otherReservedMap.get(item.inventoryItemId) ?? 0;
    const ownReservedQty = ownReservedMap.get(item.inventoryItemId) ?? 0;
    const effectiveAvailable = available + ownReservedQty;
    const sufficient = effectiveAvailable >= item.quantity;

    let warning: string | undefined;
    if (!sufficient) {
      warning =
        "There is already a pending order for this item and quantity. No stock is left for this new order. Do you really want to create this order?";
    }

    return {
      inventoryItemId: item.inventoryItemId,
      requestedQty: item.quantity,
      availableQty: effectiveAvailable,
      reservedByOthers,
      sufficient,
      warning,
    };
  });
}

export async function reserveStockForOrder(
  tx: Tx,
  orderId: string,
  branchId: string,
  items: {
    orderItemId: string;
    inventoryItemId: string;
    category: StockCategory;
    quantity: number;
  }[],
  userId: string,
  allowInsufficient = false
) {
  for (const item of items) {
    const balance = await getOrCreateBalance(tx, branchId, item.inventoryItemId, item.category);
    if (!allowInsufficient && toNumber(balance.availableQty) < item.quantity) {
      throw new StockError(`Insufficient stock for item ${item.inventoryItemId}`);
    }

    await tx.orderStockReservation.create({
      data: {
        orderId,
        orderItemId: item.orderItemId,
        branchId,
        inventoryItemId: item.inventoryItemId,
        quantity: item.quantity,
        status: "ACTIVE",
      },
    });

    await recordMovement(tx, {
      branchId,
      inventoryItemId: item.inventoryItemId,
      category: item.category,
      movementType: "RESERVE",
      quantity: item.quantity,
      referenceType: "ORDER",
      referenceId: orderId,
      createdByUserId: userId,
      balanceDelta: { reserved: item.quantity },
    });
  }
}

export async function releaseOrderReservations(
  tx: Tx,
  orderId: string,
  userId: string
) {
  const reservations = await tx.orderStockReservation.findMany({
    where: { orderId, status: "ACTIVE" },
    include: { orderItem: true },
  });

  for (const res of reservations) {
    await recordMovement(tx, {
      branchId: res.branchId,
      inventoryItemId: res.inventoryItemId,
      category: res.orderItem.category,
      movementType: "RELEASE",
      quantity: toNumber(res.quantity),
      referenceType: "ORDER",
      referenceId: orderId,
      note: "Order cancelled - stock released",
      createdByUserId: userId,
      balanceDelta: { reserved: -toNumber(res.quantity) },
    });

    await tx.orderStockReservation.update({
      where: { id: res.id },
      data: { status: "RELEASED" },
    });
  }
}

export async function deductStockForOrderSubmit(
  tx: Tx,
  orderId: string,
  branchId: string,
  items: {
    inventoryItemId: string;
    category: StockCategory;
    quantity: number;
  }[],
  userId: string,
  allowNegative = false
) {
  for (const item of items) {
    const balance = await getOrCreateBalance(tx, branchId, item.inventoryItemId, item.category);
    if (!allowNegative && toNumber(balance.availableQty) < item.quantity) {
      throw new StockError(`Insufficient stock for item ${item.inventoryItemId}`);
    }

    await recordMovement(tx, {
      branchId,
      inventoryItemId: item.inventoryItemId,
      category: item.category,
      movementType: "OUT",
      quantity: item.quantity,
      referenceType: "ORDER_SUBMIT",
      referenceId: orderId,
      note: "Order submitted",
      createdByUserId: userId,
      balanceDelta: { onHand: -item.quantity },
      allowNegative,
    });
  }
}

export async function consumeOrderReservations(
  tx: Tx,
  orderId: string,
  userId: string
) {
  const reservations = await tx.orderStockReservation.findMany({
    where: { orderId, status: "ACTIVE" },
    include: { orderItem: true },
  });

  for (const res of reservations) {
    const qty = toNumber(res.quantity);

    await recordMovement(tx, {
      branchId: res.branchId,
      inventoryItemId: res.inventoryItemId,
      category: res.orderItem.category,
      movementType: "OUT",
      quantity: qty,
      referenceType: "ORDER_SUBMIT",
      referenceId: orderId,
      note: "Order submitted",
      createdByUserId: userId,
      balanceDelta: { onHand: -qty, reserved: -qty },
    });

    await tx.orderStockReservation.update({
      where: { id: res.id },
      data: { status: "CONSUMED" },
    });
  }
}

export async function generateOrderNumber(branchId: string): Promise<string> {
  const branch = await prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const prefix = `${branch.code}-${ymd}-`;

  const lastOrder = await prisma.order.findFirst({
    where: {
      branchId,
      orderNumber: { startsWith: prefix },
    },
    orderBy: { orderNumber: "desc" },
  });

  let nextSeq = 1;
  if (lastOrder) {
    const lastSeqStr = lastOrder.orderNumber.split("-").pop();
    const lastSeq = parseInt(lastSeqStr || "0", 10);
    nextSeq = lastSeq + 1;
  }

  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function logOrderStatus(
  tx: Tx,
  orderId: string,
  fromStatus: OrderStatus | null,
  toStatus: OrderStatus,
  userId: string,
  note?: string
) {
  return tx.orderStatusHistory.create({
    data: { orderId, fromStatus, toStatus, changedByUserId: userId, note },
  });
}

export async function logAudit(
  userId: string,
  action: string,
  entityType: string,
  entityId?: string,
  branchId?: string,
  metadata?: Record<string, unknown>
) {
  return prisma.auditLog.create({
    data: {
      userId,
      branchId,
      action,
      entityType,
      entityId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

export async function batchStockEntry(
  branchId: string,
  direction: "IN" | "OUT",
  items: { inventoryItemId: string; category: StockCategory; quantity: number }[],
  userId: string,
  allowNegative = false
) {
  return prisma.$transaction(async (tx) => {
    const movements = [];
    for (const item of items) {
      const movement = await recordMovement(tx, {
        branchId,
        inventoryItemId: item.inventoryItemId,
        category: item.category,
        movementType: direction,
        quantity: item.quantity,
        referenceType: "MANUAL",
        note: `Stock entry ${direction}`,
        createdByUserId: userId,
        balanceDelta: { onHand: direction === "IN" ? item.quantity : -item.quantity },
        allowNegative: direction === "OUT" && allowNegative,
      });
      movements.push(movement);
    }
    return movements;
  });
}

export interface LowStockItem {
  inventoryItemId: string;
  name: string;
  unit: string;
  category: StockCategory;
  available: number;
  moq: number;
  onHand: number;
  reserved: number;
  branchId?: string;
  branchName?: string;
  manual?: boolean;
  manualAlertId?: string;
}

async function fetchManualLowStockAlerts(
  branchId: string,
  category?: StockCategory
): Promise<LowStockItem[]> {
  const alerts = await prisma.manualLowStockAlert.findMany({
    where: {
      branchId,
      ...(category ? { category } : {}),
    },
    include: {
      inventoryItem: { select: { id: true, name: true, unit: true, category: true, moq: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const balances = await prisma.stockBalance.findMany({
    where: {
      branchId,
      inventoryItemId: {
        in: alerts
          .map((a) => a.inventoryItemId)
          .filter((id): id is string => Boolean(id)),
      },
    },
  });
  const balanceMap = new Map(balances.map((b) => [b.inventoryItemId, b]));

  return alerts
    .filter((a) => !category || !a.category || a.category === category)
    .map((alert) => {
      const inv = alert.inventoryItem;
      const bal = alert.inventoryItemId ? balanceMap.get(alert.inventoryItemId) : undefined;
      const available = bal ? toNumber(bal.availableQty) : 0;
      return {
        inventoryItemId: alert.inventoryItemId ?? `manual:${alert.id}`,
        name: inv?.name ?? alert.itemName,
        unit: inv?.unit ?? "",
        category: (inv?.category ?? alert.category ?? "TRADING_ITEM") as StockCategory,
        available,
        moq: inv?.moq ?? 0,
        onHand: bal ? toNumber(bal.onHandQty) : 0,
        reserved: bal ? toNumber(bal.reservedQty) : 0,
        manual: true,
        manualAlertId: alert.id,
      };
    });
}

function mergeLowStockItems(
  automatic: LowStockItem[],
  manual: LowStockItem[]
): LowStockItem[] {
  const seen = new Set(
    automatic.map((i) => i.inventoryItemId).filter((id) => !id.startsWith("manual:"))
  );
  const seenNames = new Set(automatic.map((i) => i.name.trim().toLowerCase()));

  const merged = [...automatic];
  for (const item of manual) {
    if (item.inventoryItemId && !item.inventoryItemId.startsWith("manual:")) {
      if (seen.has(item.inventoryItemId)) continue;
      seen.add(item.inventoryItemId);
    } else if (seenNames.has(item.name.trim().toLowerCase())) {
      continue;
    }
    seenNames.add(item.name.trim().toLowerCase());
    merged.push(item);
  }
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createManualLowStockAlert(input: {
  branchId: string;
  itemName: string;
  inventoryItemId?: string;
  category?: StockCategory;
  createdByUserId: string;
}) {
  const name = input.itemName.trim();
  if (!name) throw new StockError("Item name is required");

  let inventoryItemId = input.inventoryItemId;
  let category = input.category;

  if (inventoryItemId) {
    const inv = await prisma.inventoryItem.findFirst({
      where: { id: inventoryItemId, isActive: true },
    });
    if (!inv) throw new StockError("Item not found in master list");
    inventoryItemId = inv.id;
    category = inv.category;
  }

  const existing = await prisma.manualLowStockAlert.findFirst({
    where: {
      branchId: input.branchId,
      itemName: name,
    },
  });
  if (existing) throw new StockError("This item is already in manual low stock");

  return prisma.manualLowStockAlert.create({
    data: {
      branchId: input.branchId,
      itemName: name,
      inventoryItemId: inventoryItemId ?? null,
      category: category ?? null,
      createdByUserId: input.createdByUserId,
    },
  });
}

export async function deleteManualLowStockAlert(id: string, branchId: string) {
  const alert = await prisma.manualLowStockAlert.findFirst({
    where: { id, branchId },
  });
  if (!alert) throw new StockError("Manual low stock entry not found");
  await prisma.manualLowStockAlert.delete({ where: { id } });
}

export async function getLowStockItems(
  branchId: string,
  category?: StockCategory
): Promise<{ count: number; items: LowStockItem[] }> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      category: StockCategory;
      moq: number;
      unit: string | null;
      onHand: number;
      reserved: number;
      available: number;
    }>
  >`
    SELECT
      i.id,
      i.name,
      i.category,
      i.moq,
      i.unit,
      COALESCE(sb."onHandQty", 0)::float AS "onHand",
      COALESCE(sb."reservedQty", 0)::float AS "reserved",
      COALESCE(sb."availableQty", 0)::float AS "available"
    FROM "InventoryItem" i
    LEFT JOIN "StockBalance" sb
      ON sb."inventoryItemId" = i.id AND sb."branchId" = ${branchId}
    WHERE i."isActive" = true
      ${category ? Prisma.sql`AND i.category = ${category}::"StockCategory"` : Prisma.empty}
      AND COALESCE(sb."availableQty", 0) <= i.moq
    ORDER BY i.name ASC
  `;

  const lowStockItems: LowStockItem[] = rows.map((row) => ({
    inventoryItemId: row.id,
    name: row.name,
    unit: row.unit ?? "",
    category: row.category,
    available: row.available,
    moq: row.moq,
    onHand: row.onHand,
    reserved: row.reserved,
  }));

  const manual = await fetchManualLowStockAlerts(branchId, category);
  const items = mergeLowStockItems(lowStockItems, manual);
  return { count: items.length, items };
}

export async function getLowStockItemsAllBranches(
  category?: StockCategory
): Promise<{ count: number; items: LowStockItem[] }> {
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const branchResults = await Promise.all(
    branches.map((branch) => getLowStockItems(branch.id, category))
  );

  const allItems: LowStockItem[] = [];
  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    for (const item of branchResults[i].items) {
      allItems.push({
        ...item,
        branchId: branch.id,
        branchName: branch.name,
      });
    }
  }

  return { count: allItems.length, items: allItems };
}

export class StockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockError";
  }
}
