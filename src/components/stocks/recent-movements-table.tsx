"use client";

import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatQty } from "@/lib/utils";

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
  const groups = groupByDate(movements);

  return (
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
                      <Badge status={m.movementType as string} />
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
  );
}
