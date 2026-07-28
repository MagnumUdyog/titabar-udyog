"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { api } from "@/lib/fetcher";
import { formatOrderDate, formatQty, formatUnit } from "@/lib/utils";

interface ReservationRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  createdAt: string;
  createdBy: string;
}

interface OutModalState {
  itemName: string;
  itemUnit: string;
  loading: boolean;
  reservations: ReservationRow[];
  totalReserved: number;
}

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

export function RecentMovementsTable({
  movements,
}: {
  movements: Array<Record<string, unknown>>;
}) {
  const router = useRouter();
  const [outModal, setOutModal] = useState<OutModalState | null>(null);
  const groups = groupByDate(movements);

  const openOutModal = async (movement: Record<string, unknown>) => {
    const inv = movement.inventoryItem as { id: string; name: string; unit?: string | null };
    const branchId = movement.branchId as string;
    const referenceType = movement.referenceType as string;
    const referenceId = movement.referenceId as string | null | undefined;
    const itemId = (movement.inventoryItemId as string) || inv.id;
    const itemName = inv.name;
    const itemUnit = inv.unit || "";

    setOutModal({
      itemName,
      itemUnit,
      loading: true,
      reservations: [],
      totalReserved: 0,
    });

    try {
      if (
        referenceId &&
        (referenceType === "ORDER" || referenceType === "ORDER_SUBMIT")
      ) {
        const data = await api<{
          order: {
            id: string;
            orderNumber: string;
            customerName: string;
            customerPhone: string;
            createdAt: string;
            createdBy: { name: string };
            items: Array<{ inventoryItemId: string; quantity: number }>;
          };
        }>(`/api/orders/${referenceId}`);
        const order = data.order;
        const line = order.items.find((i) => i.inventoryItemId === itemId);
        const quantity = line ? Number(line.quantity) : Number(movement.quantity);

        setOutModal({
          itemName,
          itemUnit,
          loading: false,
          totalReserved: quantity,
          reservations: [
            {
              orderId: order.id,
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              quantity,
              createdAt: order.createdAt,
              createdBy: order.createdBy.name,
            },
          ],
        });
        return;
      }

      const data = await api<{
        totalReserved: number;
        reservations: ReservationRow[];
      }>(
        `/api/stocks/reservations?branchId=${encodeURIComponent(branchId)}&itemId=${encodeURIComponent(itemId)}`
      );

      setOutModal({
        itemName,
        itemUnit,
        loading: false,
        reservations: data.reservations,
        totalReserved: data.totalReserved,
      });
    } catch {
      setOutModal({
        itemName,
        itemUnit,
        loading: false,
        reservations: [],
        totalReserved: 0,
      });
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

      <Modal
        open={outModal !== null}
        onClose={() => setOutModal(null)}
        title={
          outModal
            ? `Reserved — ${outModal.itemName}${outModal.itemUnit ? ` (${formatUnit(outModal.itemUnit)})` : ""}`
            : "Reserved Stock"
        }
        footer={
          <Button variant="secondary" onClick={() => setOutModal(null)}>
            Close
          </Button>
        }
      >
        {outModal?.loading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : outModal && outModal.reservations.length === 0 ? (
          <p className="text-sm text-muted">No pending reservations for this item.</p>
        ) : outModal ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Total reserved:{" "}
              <span className="font-semibold text-foreground">
                {formatQty(outModal.totalReserved)}
              </span>{" "}
              across {outModal.reservations.length} pending order
              {outModal.reservations.length !== 1 ? "s" : ""}
            </p>
            <Table>
              <THead>
                <TR>
                  <TH>Order #</TH>
                  <TH>Customer</TH>
                  <TH>Phone</TH>
                  <TH>Qty</TH>
                  <TH>Created By</TH>
                  <TH>Date</TH>
                </TR>
              </THead>
              <TBody>
                {outModal.reservations.map((r) => (
                  <TR
                    key={r.orderId}
                    className="cursor-pointer"
                    onClick={() => {
                      setOutModal(null);
                      router.push(`/orders/${r.orderId}`);
                    }}
                  >
                    <TD className="font-semibold text-primary">{r.orderNumber}</TD>
                    <TD className="font-semibold">{r.customerName}</TD>
                    <TD>{r.customerPhone}</TD>
                    <TD className="font-medium">{formatQty(r.quantity)}</TD>
                    <TD className="text-muted">{r.createdBy}</TD>
                    <TD className="text-muted">{formatOrderDate(r.createdAt)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
