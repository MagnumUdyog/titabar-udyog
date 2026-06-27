"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ItemSearchInput,
  type InventorySearchItem,
} from "@/components/orders/item-search-input";
import { RecentMovementsTable } from "@/components/stocks/recent-movements-table";
import { BranchSelector } from "@/components/branch-selector";
import { api, ApiError } from "@/lib/fetcher";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { Table, THead, TR, TH } from "@/components/ui/table";

type Direction = "IN" | "OUT";
type Category = "RAW_MATERIAL" | "FINISHED_GOOD" | "TRADING_ITEM";
type TabKey = Category | "ALL";

const MOVEMENT_TABS: { key: TabKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "RAW_MATERIAL", label: "Raw Materials" },
  { key: "FINISHED_GOOD", label: "Finished Goods" },
  { key: "TRADING_ITEM", label: "Trading Items" },
];

interface EntryLine {
  inventoryItemId?: string;
  name: string;
  unit: string;
  category: string;
  quantity: number;
  unverified: boolean;
  savedName: string;
  savedQty: number;
  savedInventoryItemId?: string;
  savedUnverified: boolean;
}

function StockEntryContent() {
  const searchParams = useSearchParams();
  const itemRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const rowNameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rowQtyRefs = useRef<(HTMLInputElement | null)[]>([]);

  const initialDir = searchParams.get("dir") === "OUT" ? "OUT" : "IN";
  const [direction, setDirection] = useState<Direction>(initialDir);
  const [branchId, setBranchId] = useState("");
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<InventorySearchItem | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [qty, setQty] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [lowStockWarning, setLowStockWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [movements, setMovements] = useState<Array<Record<string, unknown>>>([]);
  const [movementTab, setMovementTab] = useState<TabKey>("ALL");
  const [movementSearch, setMovementSearch] = useState("");
  const [debouncedMovementSearch, setDebouncedMovementSearch] = useState("");
  const [movementMonth, setMovementMonth] = useState("");
  const [movementYear, setMovementYear] = useState(new Date().getFullYear().toString());
  const [movementsLoading, setMovementsLoading] = useState(false);
  const warningRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedMovementSearch(movementSearch), 300);
    return () => clearTimeout(t);
  }, [movementSearch]);

  const loadMovements = useCallback(async () => {
    if (!branchId) {
      setMovements([]);
      return;
    }
    setMovementsLoading(true);
    try {
      const params = new URLSearchParams({
        branchId,
        page: "1",
        limit: String(20),
      });
      if (movementTab !== "ALL") params.set("category", movementTab);
      if (debouncedMovementSearch) params.set("search", debouncedMovementSearch);
      if (movementMonth) params.set("month", movementMonth);
      if (movementYear) params.set("year", movementYear);
      const data = await api<{ movements: Array<Record<string, unknown>> }>(
        `/api/stocks/movements?${params}`
      );
      setMovements(data.movements);
    } finally {
      setMovementsLoading(false);
    }
  }, [branchId, movementTab, debouncedMovementSearch, movementMonth, movementYear]);

  useEffect(() => {
    const d = searchParams.get("dir");
    if (d === "IN" || d === "OUT") setDirection(d);
  }, [searchParams]);

  useEffect(() => {
    api<{ user: { branchId: string | null } }>("/api/auth/me").then(async (d) => {
      if (d.user.branchId) {
        setBranchId(d.user.branchId);
        return;
      }
      const { branches } = await api<{ branches: { id: string }[] }>("/api/branches");
      if (branches[0]) setBranchId(branches[0].id);
    });
  }, []);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  const activeCategory = selectedItem?.category ?? (unverified ? "TRADING_ITEM" : "");
  const activeUnit = selectedItem?.unit ?? "pcs";

  const clearAddRow = () => {
    setItemQuery("");
    setSelectedItem(null);
    setUnverified(false);
    setQty("");
  };

  const resetRow = () => {
    clearAddRow();
    setTimeout(() => itemRef.current?.focus(), 0);
  };

  const exitAddRowToLastLine = () => {
    clearAddRow();
    if (lines.length > 0) {
      setTimeout(() => focus(rowQtyRefs.current[lines.length - 1]), 0);
    }
  };

  const focus = (el: HTMLElement | null | undefined) => {
    el?.focus();
  };

  const updateLine = (index: number, patch: Partial<EntryLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const revertLineItem = (index: number) => {
    const line = lines[index];
    if (!line) return;
    updateLine(index, {
      name: line.savedName,
      inventoryItemId: line.savedInventoryItemId,
      unverified: line.savedUnverified,
    });
  };

  const addLine = () => {
    const name = selectedItem?.name ?? itemQuery.trim();
    const quantity = parseFloat(qty);
    if (!name || !quantity || quantity <= 0) {
      setFormError("Enter item name and quantity");
      return;
    }
    const isUnverified = unverified || !selectedItem;
    setLines((prev) => [
      ...prev,
      {
        inventoryItemId: selectedItem?.id,
        name,
        unit: activeUnit,
        category: activeCategory || "TRADING_ITEM",
        quantity,
        unverified: isUnverified,
        savedName: name,
        savedQty: quantity,
        savedInventoryItemId: selectedItem?.id,
        savedUnverified: isUnverified,
      },
    ]);
    setFormError(null);
    resetRow();
  };

  const switchDirection = (d: Direction) => {
    setDirection(d);
    setLines([]);
    resetRow();
    setFormError(null);
    setLowStockWarning(false);
  };

  const submit = async (allowNegative = false) => {
    setFormError(null);
    if (!branchId) {
      setFormError("Select a branch");
      return;
    }
    if (lines.length === 0) {
      setFormError("Add at least one item");
      return;
    }

    setSubmitting(true);
    try {
      await api("/api/stock-entry", {
        method: "POST",
        body: JSON.stringify({
          branchId,
          direction,
          allowNegative,
          items: lines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            itemName: l.unverified || !l.inventoryItemId ? l.name : undefined,
            category: l.category,
            quantity: l.quantity,
          })),
        }),
      });
      setLines([]);
      resetRow();
      setLowStockWarning(false);
      setFormError(null);
      loadMovements();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setLowStockWarning(true);
        setTimeout(() => warningRef.current?.focus(), 0);
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">IN-OUT</h1>
        <p className="text-xs text-muted">Enter → next · Esc → clear / back · Keyboard-first</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["IN", "OUT"] as Direction[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => switchDirection(d)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium",
              direction === d ? "bg-primary text-white" : "bg-slate-100 text-slate-700"
            )}
          >
            {d}
          </button>
        ))}
        <BranchSelector
          value={branchId}
          onChange={setBranchId}
          allowAll={false}
          className="w-48"
        />
      </div>

      {formError && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {formError}
        </p>
      )}

      {lowStockWarning && (
        <div
          ref={warningRef}
          tabIndex={0}
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 outline-none ring-2 ring-amber-400"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setLowStockWarning(false);
            }
            if (e.key === "Enter") {
              e.preventDefault();
              setLowStockWarning(false);
              submit(true);
            }
          }}
        >
          <p>Stock may go negative. Continue?</p>
          <p className="mt-1 text-xs text-muted">Esc = No · Enter = Yes</p>
        </div>
      )}

      <Card title="Items">
        {lines.length > 0 && (
          <table className="mb-2 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted">
                <th className="w-8 py-1 pr-2">#</th>
                <th className="py-1 pr-2">Item</th>
                <th className="w-14 py-1 pr-2">Unit</th>
                <th className="w-32 py-1 pr-2">Category</th>
                <th className="w-20 py-1 pr-2 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="py-1 pr-2 text-muted">{i + 1}</td>
                  <td className="py-1 pr-2">
                    <Input
                      ref={(el) => {
                        rowNameRefs.current[i] = el;
                      }}
                      value={l.name}
                      onChange={(e) =>
                        updateLine(i, {
                          name: e.target.value,
                          inventoryItemId: undefined,
                          unverified: true,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          focus(rowQtyRefs.current[i]);
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          if (l.name !== l.savedName) {
                            revertLineItem(i);
                          } else if (i > 0) {
                            focus(rowQtyRefs.current[i - 1]);
                          } else {
                            focus(itemRef.current);
                          }
                        }
                      }}
                      className="h-7 text-sm"
                    />
                  </td>
                  <td className="py-1 pr-2 text-sm text-muted">{l.unit}</td>
                  <td className="py-1 pr-2">
                    <Badge status={l.category} />
                  </td>
                  <td className="py-1 text-right">
                    <Input
                      ref={(el) => {
                        rowQtyRefs.current[i] = el;
                      }}
                      type="number"
                      value={l.quantity}
                      onChange={(e) => {
                        const q = parseFloat(e.target.value);
                        if (q > 0) updateLine(i, { quantity: q });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (i < lines.length - 1) {
                            focus(rowNameRefs.current[i + 1]);
                          } else {
                            focus(itemRef.current);
                          }
                          return;
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          if (l.quantity !== l.savedQty) {
                            updateLine(i, { quantity: l.savedQty });
                          } else {
                            focus(rowNameRefs.current[i]);
                          }
                        }
                      }}
                      className="ml-auto h-7 w-20 text-right text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex flex-wrap items-start gap-1.5">
          <ItemSearchInput
            value={itemQuery}
            selected={selectedItem}
            unverified={unverified}
            onQueryChange={setItemQuery}
            onSelect={setSelectedItem}
            onUnverifiedChange={setUnverified}
            inputRef={itemRef}
            onEnterNext={() => qtyRef.current?.focus()}
            onEscape={() => {
              if (lines.length > 0) exitAddRowToLastLine();
            }}
          />
          {activeCategory && <Badge status={activeCategory} className="mt-1 shrink-0" />}
          <Input
            ref={qtyRef}
            type="number"
            placeholder="Qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addLine();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                if (qty) {
                  setQty("");
                } else if (itemQuery.trim() || selectedItem || unverified) {
                  itemRef.current?.focus();
                } else if (lines.length > 0) {
                  exitAddRowToLastLine();
                } else {
                  itemRef.current?.focus();
                }
              }
            }}
            className="h-8 w-20 shrink-0 text-sm"
          />
          <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={addLine}>
            Add
          </Button>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => submit(false)} disabled={submitting || lines.length === 0}>
          {submitting ? "Submitting..." : `Submit ${direction}`}
        </Button>
      </div>

      {branchId && (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3">
            <div className="flex flex-wrap gap-1">
              {MOVEMENT_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setMovementTab(t.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm",
                    movementTab === t.key ? "bg-primary text-white" : "bg-slate-100"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Input
              placeholder="Search name or sub-heading..."
              value={movementSearch}
              onChange={(e) => setMovementSearch(e.target.value)}
              className="w-56"
            />
            <Select
              value={movementMonth}
              onChange={(e) => setMovementMonth(e.target.value)}
              className="w-32"
            >
              <option value="">All Months</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {new Date(2000, i).toLocaleString("en", { month: "short" })}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              value={movementYear}
              onChange={(e) => setMovementYear(e.target.value)}
              className="w-24"
              placeholder="Year"
            />
          </div>
          <Card title="Recent Movements">
            {movementsLoading ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Type</TH>
                    <TH>Item</TH>
                    <TH>Qty</TH>
                    <TH>By</TH>
                  </TR>
                </THead>
                <SkeletonTable rows={6} cols={5} />
              </Table>
            ) : (
              <RecentMovementsTable movements={movements} />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function StockEntryPageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-48" />
      <div className="rounded-lg border border-border p-4">
        <Skeleton className="mb-3 h-5 w-24" />
        <Skeleton className="h-8 w-full" />
      </div>
      <Table>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Type</TH>
            <TH>Item</TH>
            <TH>Qty</TH>
            <TH>By</TH>
          </TR>
        </THead>
        <SkeletonTable rows={6} cols={5} />
      </Table>
    </div>
  );
}

export default function StockEntryPage() {
  return (
    <Suspense fallback={<StockEntryPageSkeleton />}>
      <StockEntryContent />
    </Suspense>
  );
}
