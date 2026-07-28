import { prisma } from "./db";
import { toNumber } from "./utils";

export interface MovementOrderRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  orderStatus: string;
  createdAt: string;
  createdBy: string;
}

function toOrderRow(
  order: {
    id: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    status: string;
    createdAt: Date;
    createdBy: { name: string };
  },
  quantity: number
): MovementOrderRow {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    quantity,
    orderStatus: order.status,
    createdAt: order.createdAt.toISOString(),
    createdBy: order.createdBy.name,
  };
}

async function loadLinkedOrder(
  orderId: string,
  inventoryItemId: string,
  movementQty: number
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      customerPhone: true,
      status: true,
      createdAt: true,
      createdBy: { select: { name: true } },
      items: {
        where: { inventoryItemId },
        select: { quantity: true },
      },
    },
  });

  if (!order) return null;

  const lineQty = order.items[0] ? toNumber(order.items[0].quantity) : movementQty;
  return {
    totalReserved: lineQty,
    reservations: [toOrderRow(order, lineQty)],
  };
}

async function findSubmittedOrderNearMovement(
  branchId: string,
  inventoryItemId: string,
  movementQty: number,
  movementAt: Date
) {
  const windowMs = 10 * 60 * 1000;
  const from = new Date(movementAt.getTime() - windowMs);
  const to = new Date(movementAt.getTime() + windowMs);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      inventoryItemId,
      order: {
        branchId,
        status: "SUBMITTED",
        submittedAt: { gte: from, lte: to },
      },
    },
    select: {
      quantity: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          status: true,
          createdAt: true,
          submittedAt: true,
          createdBy: { select: { name: true } },
        },
      },
    },
    orderBy: { order: { submittedAt: "desc" } },
  });

  const match = orderItems.find((oi) => toNumber(oi.quantity) === movementQty);
  if (!match) return null;

  return {
    totalReserved: movementQty,
    reservations: [toOrderRow(match.order, movementQty)],
  };
}

async function findPendingOrders(branchId: string, inventoryItemId: string) {
  const orderItems = await prisma.orderItem.findMany({
    where: {
      inventoryItemId,
      order: {
        branchId,
        status: "PENDING",
      },
    },
    select: {
      quantity: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          status: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      },
    },
    orderBy: { order: { createdAt: "desc" } },
  });

  const reservations = orderItems.map((oi) =>
    toOrderRow(oi.order, toNumber(oi.quantity))
  );

  return {
    totalReserved: reservations.reduce((sum, r) => sum + r.quantity, 0),
    reservations,
  };
}

export async function getMovementOrderContext(movementId: string) {
  const movement = await prisma.stockMovement.findUniqueOrThrow({
    where: { id: movementId },
    include: {
      inventoryItem: { select: { id: true, name: true, unit: true } },
    },
  });

  const item = movement.inventoryItem;
  const movementQty = toNumber(movement.quantity);
  const isOrderReference =
    movement.referenceType === "ORDER" || movement.referenceType === "ORDER_SUBMIT";

  if (movement.referenceId) {
    const linked = await loadLinkedOrder(
      movement.referenceId,
      movement.inventoryItemId,
      movementQty
    );
    if (linked) {
      return {
        item,
        movementQty,
        totalReserved: linked.totalReserved,
        outType: "order-submitted" as const,
        source: "linked-order" as const,
        reservations: linked.reservations,
      };
    }
  }

  if (isOrderReference) {
    const submitted = await findSubmittedOrderNearMovement(
      movement.branchId,
      movement.inventoryItemId,
      movementQty,
      movement.createdAt
    );
    if (submitted) {
      return {
        item,
        movementQty,
        totalReserved: submitted.totalReserved,
        outType: "order-submitted" as const,
        source: "linked-order" as const,
        reservations: submitted.reservations,
      };
    }
  }

  const pending = await findPendingOrders(movement.branchId, movement.inventoryItemId);
  if (pending.reservations.length > 0) {
    return {
      item,
      movementQty,
      totalReserved: movementQty,
      outType: "direct-out" as const,
      source: "pending-orders" as const,
      reservations: pending.reservations,
      relatedOrdersLabel: "Pending orders for this item",
    };
  }

  return {
    item,
    movementQty,
    totalReserved: movementQty,
    outType: "direct-out" as const,
    source: "direct-out" as const,
    reservations: [],
  };
}
