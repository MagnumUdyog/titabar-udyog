"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  StockOrdersModal,
  type StockOrderRow,
} from "@/components/stocks/stock-orders-modal";
import { api } from "@/lib/fetcher";
import { formatQty, formatUnit } from "@/lib/utils";

function groupByDate(movements: Array<Record<string, unknown>>) {
  const sorted = [...movements].sort(
    (a, b) =>
      new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
  );
  const groups: Array<{ dateKey: string; dateLabel: string; items: typeof sorted }> = [];
  const map = new Map<string, typeof sorted>();

  for (const m of sorted) {
    const d = new Date(m.createdAt as string);
    const dateKey = d.toISOString().split("T")[0];
    if (!map.has(dateKey)) {
      const bucket: typeof sorted = [];
      map.set(dateKey, bucket);
      groups.push({
        dateKey,
        dateLabel: d.toLocaleDateString("en-IN", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        items: bucket,
      });
    }
    map.get(dateKey)!.push(m);
  }
  return groups;
}

async function loadOutModalData(movement: Record<string, unknown>): Promise<{
  reservations: StockOrderRow[];
}> {
  const branchId = movement.branchId as string | undefined;
  const item = movement.inventoryItem as { id: string };
  const movementQty = Number(movement.quantity);
  const referenceId = movement.referenceId as string | null | undefined;
  const referenceType = movement.referenceType as string;

  const isOrderLinked =
    Boolean(referenceId) &&
    (referenceType === "ORDER" || referenceType === "ORDER_SUBMIT");

  if (isOrderLinked && referenceId) {
    try {
      const { order } = await api<{ order: Record<string, unknown> }>(
        `/api/orders/${referenceId}`
      );
      const items = (order.items as Array<Record<string, unknown>>) || [];
      const line = items.find((i) => i.inventoryItemId === item.id);
      const lineQty = line ? Number(line.quantity) : movementQty;
      const createdBy = order.createdBy as { name: string };

      return {
        reservations: [
          {
            orderId: order.id as string,
            orderNumber: order.orderNumber as string,
            customerName: order.customerName as string,
            customerPhone: order.customerPhone as string,
            quantity: lineQty,
            createdAt: order.createdAt as string,
            createdBy: createdBy.name,
          },
        ],
      };
    } catch {
      /* fall through */
    }
  }

  if (branchId && item.id) {
    try {
      const data = await api<{ reservations: StockOrderRow[] }>(
        `/api/stocks/reservations?branchId=${encodeURIComponent(branchId)}&itemId=${encodeURIComponent(item.id)}`
      );
      const reservations = data.reservations ?? [];
      if (reservations.length > 0) {
        return { reservations };
      }
    } catch {
      /* fall through */
    }
  }

  return { reservations: [] };
}

export function RecentMovementsTable({
  movements,
}: {
  movements: Array<Record<string, unknown>>;
}) {
  const groups = groupByDate(movements);
  const [outModal, setOutModal] = useState<{
    open: boolean;
    title: string;
    loading: boolean;
    reservations: StockOrderRow[];
  }>({
    open: false,
    title: "",
    loading: false,
    reservations: [],
  });

  const openOutModal = async (movement: Record<string, unknown>) => {
    const inv = movement.inventoryItem as { name: string; unit?: string | null };
    const itemName = inv.name;
    const itemUnit = inv.unit || "";
    const title = `Out — ${itemName}${itemUnit ? ` (${formatUnit(itemUnit)})` : ""}`;

    setOutModal({
      open: true,
      title,
      loading: true,
      reservations: [],
    });

    try {
      const data = await loadOutModalData(movement);

      setOutModal({
        open: true,
        title,
        loading: false,
        reservations: data.reservations,
      });
    } catch {
      setOutModal((prev) => ({
        ...prev,
        loading: false,
        reservations: [],
      }));
    }
  };

  return (
    <>
      <Table tableClassName="table-fixed">
        <colgroup>
          <col style={{ width: "26%" }} />
          <col style={{ width: "12%" }} />
          <col />
          <col style={{ width: "10%" }} />
          <col style={{ width: "14%" }} />
        </colgroup>
        <THead>
          <TR className="hover:bg-slate-50">
            <TH>Date</TH>
            <TH>Type</TH>
            <TH>Item</TH>
            <TH>Qty</TH>
            <TH>By</TH>
          </TR>
        </THead>
        <TBody>
          {groups.map((group, groupIndex) => {
            const groupBg = groupIndex % 2 === 0 ? "#ffffff" : "#f3f4f6";
            const headerBg = groupIndex % 2 === 0 ? "#e5e7eb" : "#d1d5db";

            return (
              <Fragment key={group.dateKey}>
                <TR style={{ background: groupBg }} className="hover:bg-inherit">
                  <TD colSpan={5} className="p-0">
                    <div
                      style={{
                        background: headerBg,
                        padding: "6px 16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#374151",
                          letterSpacing: "0.3px",
                        }}
                      >
                        {group.dateLabel}
                      </span>
                      <span style={{ fontSize: "11px", color: "#6b7280", fontWeight: 500 }}>
                        {group.items.length} movement{group.items.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </TD>
                </TR>
                {group.items.map((m, i) => {
                  const inv = m.inventoryItem as { name: string };
                  const by = m.createdBy as { name: string };
                  const movementType = m.movementType as string;
                  return (
                    <TR
                      key={m.id as string}
                      style={{
                        background: groupBg,
                        borderBottom:
                          i < group.items.length - 1 ? "1px solid #e9ecef" : undefined,
                      }}
                      className="hover:bg-inherit"
                    >
                      <TD>{new Date(m.createdAt as string).toLocaleString()}</TD>
                      <TD>
                        {movementType === "OUT" ? (
                          <button
                            type="button"
                            onClick={() => void openOutModal(m)}
                            className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                          >
                            OUT
                          </button>
                        ) : (
                          <Badge status={movementType} />
                        )}
                      </TD>
                      <TD className="font-semibold">{inv.name}</TD>
                      <TD>{formatQty(Number(m.quantity))}</TD>
                      <TD>{by.name}</TD>
                    </TR>
                  );
                })}
              </Fragment>
            );
          })}
        </TBody>
      </Table>

      <StockOrdersModal
        open={outModal.open}
        onClose={() => setOutModal((prev) => ({ ...prev, open: false }))}
        title={outModal.title}
        loading={outModal.loading}
        reservations={outModal.reservations}
      />
    </>
  );
}
