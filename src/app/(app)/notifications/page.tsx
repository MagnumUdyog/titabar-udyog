"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { BranchSelector } from "@/components/branch-selector";
import {
  ItemSearchInput,
  type InventorySearchItem,
} from "@/components/orders/item-search-input";
import { api, ApiError } from "@/lib/fetcher";
import { cn, formatQty } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { LowStockItem } from "@/lib/stock";

type Category = "RAW_MATERIAL" | "FINISHED_GOOD" | "TRADING_ITEM";
type TabKey = Category | "ALL";
type SourceTab = "ALL" | "AUTOMATIC" | "MANUAL";

interface ManualLine {
  id: string;
  name: string;
  inventoryItemId?: string;
  category: string;
  unverified: boolean;
}

const SOURCE_OPTIONS: { key: SourceTab; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "AUTOMATIC", label: "Automatic" },
  { key: "MANUAL", label: "Manual" },
];

const TABS: { key: TabKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "RAW_MATERIAL", label: "Raw Materials" },
  { key: "FINISHED_GOOD", label: "Finished Goods" },
  { key: "TRADING_ITEM", label: "Trading Items" },
];

function toSelected(line: ManualLine): InventorySearchItem | null {
  if (!line.inventoryItemId) return null;
  return {
    id: line.inventoryItemId,
    name: line.name,
    category: line.category,
    unit: "",
  };
}

export default function NotificationsPage() {
  const [branchId, setBranchId] = useState("");
  const [tab, setTab] = useState<TabKey>("ALL");
  const [sourceTab, setSourceTab] = useState<SourceTab>("ALL");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [manualOpen, setManualOpen] = useState(false);
  const [lines, setLines] = useState<ManualLine[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<InventorySearchItem | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const itemRef = useRef<HTMLInputElement>(null);
  const rowNameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const addRowRef = useRef({
    itemQuery: "",
    selectedItem: null as InventorySearchItem | null,
    unverified: false,
  });

  const activeCategory = selectedItem?.category ?? (unverified ? "TRADING_ITEM" : "");

  const syncAddRowRef = (
    patch: Partial<{ itemQuery: string; selectedItem: InventorySearchItem | null; unverified: boolean }>
  ) => {
    addRowRef.current = { ...addRowRef.current, ...patch };
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (branchId) params.set("branchId", branchId);
      if (tab !== "ALL") params.set("category", tab);
      const data = await api<{ count: number; items: LowStockItem[] }>(
        `/api/notifications/low-stock?${params}`
      );
      setItems(data.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [branchId, tab]);

  useEffect(() => {
    api<{ user: { role: string; branchId: string | null } }>("/api/auth/me").then((d) => {
      if (d.user.role === "BRANCH_USER" && d.user.branchId) {
        setBranchId(d.user.branchId);
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clearAddRow = () => {
    syncAddRowRef({ itemQuery: "", selectedItem: null, unverified: false });
    setItemQuery("");
    setSelectedItem(null);
    setUnverified(false);
  };

  const resetAddRow = () => {
    clearAddRow();
    setTimeout(() => itemRef.current?.focus(), 0);
  };

  const updateLine = (index: number, patch: Partial<ManualLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const commitAddRow = (): boolean => {
    const { itemQuery: q, selectedItem: sel, unverified: uv } = addRowRef.current;
    const name = sel?.name ?? q.trim();
    if (!name) {
      setManualError("Enter an item name");
      return false;
    }
    const category = sel?.category ?? "TRADING_ITEM";
    const isUnverified = uv || !sel;
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        inventoryItemId: sel?.id,
        category,
        unverified: isUnverified,
      },
    ]);
    setManualError(null);
    resetAddRow();
    return true;
  };

  const collectAllLines = (): ManualLine[] => {
    const result = [...lines];
    const { itemQuery: q, selectedItem: sel, unverified: uv } = addRowRef.current;
    const name = sel?.name ?? q.trim();
    if (name) {
      result.push({
        id: "pending",
        name,
        inventoryItemId: sel?.id,
        category: sel?.category ?? "TRADING_ITEM",
        unverified: uv || !sel,
      });
    }
    return result;
  };

  const openManual = () => {
    setManualOpen(true);
    setLines([]);
    clearAddRow();
    setManualError(null);
    setTimeout(() => itemRef.current?.focus(), 0);
  };

  const saveManualLowStock = async () => {
    if (!branchId) {
      setManualError("Select a branch first");
      return;
    }

    const toSave = collectAllLines();
    if (toSave.length === 0) {
      setManualError("Add at least one item");
      return;
    }

    setSaving(true);
    setManualError(null);

    try {
      for (const line of toSave) {
        await api("/api/notifications/manual-low-stock", {
          method: "POST",
          body: JSON.stringify({
            branchId,
            itemName: line.name,
            inventoryItemId: line.inventoryItemId,
          }),
        });
      }
      setManualOpen(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError) setManualError(err.message);
      else setManualError("Failed to add items");
    } finally {
      setSaving(false);
    }
  };

  const removeManual = async (alertId: string) => {
    if (!branchId) return;
    try {
      await api(
        `/api/notifications/manual-low-stock?id=${encodeURIComponent(alertId)}&branchId=${encodeURIComponent(branchId)}`,
        { method: "DELETE" }
      );
      await load();
    } catch {
      /* ignore */
    }
  };

  const searchLower = search.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (sourceTab === "MANUAL" && !item.manual) return false;
    if (sourceTab === "AUTOMATIC" && item.manual) return false;
    if (searchLower && !item.name.toLowerCase().includes(searchLower)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Notifications</h1>
        <p className="text-sm text-muted">Items running low on stock</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3">
        <BranchSelector value={branchId} onChange={setBranchId} className="w-48" />
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === t.key ? "bg-primary text-white" : "bg-slate-100"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search notifications..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
        <Select
          value={sourceTab}
          onChange={(e) => setSourceTab(e.target.value as SourceTab)}
          className="w-36"
        >
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Button type="button" className="ml-auto shrink-0" onClick={openManual}>
          Manual Low Stock Entry
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <div className="mb-3 text-4xl">✅</div>
          <div className="text-base font-semibold">
            {searchLower || sourceTab !== "ALL"
              ? "No matching notifications"
              : "All stocks are healthy"}
          </div>
          <div className="mt-1 text-sm">
            {searchLower || sourceTab !== "ALL"
              ? "Try a different search or filter"
              : "No items are running low"}
          </div>
        </div>
      ) : (
        <div>
          {filteredItems.map((item) => (
            <div
              key={`${item.branchId ?? ""}-${item.manualAlertId ?? item.inventoryItemId}`}
              className="mb-2 flex items-center justify-between rounded-lg border border-red-100 border-l-4 border-l-red-600 bg-white px-5 py-4"
            >
              <div className="flex items-center gap-3">
                <div className="low-stock-pulse h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" />
                <div>
                  <div className="text-[15px] font-semibold text-gray-900">
                    {item.name}
                    {item.branchName ? (
                      <span className="ml-2 text-xs font-normal text-muted">
                        ({item.branchName})
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[13px] text-gray-500">
                    {!item.manual && (
                      <>
                        {" "}
                        · Available: {formatQty(item.available)} · MOQ: {formatQty(item.moq)}
                      </>
                    )}
                    {item.manual && <span> · Manually flagged</span>}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge status={item.category} className="shrink-0" />
                {item.manual && item.manualAlertId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted hover:text-red-600"
                    onClick={() => void removeManual(item.manualAlertId!)}
                  >
                    Remove
                  </Button>
                )}
                <div className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
                  {item.manual ? "MANUAL" : item.available === 0 ? "OUT OF STOCK" : "LOW STOCK"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Manual Low Stock Entry"
        footer={
          <>
            <Button variant="secondary" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveManualLowStock()} disabled={saving}>
              {saving ? "Adding..." : "Add to Low Stock"}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Type item names to flag as low stock. Use ↑↓ to browse suggestions, Enter to add the next
          item, Esc to go back.
        </p>

        {!branchId && (
          <p className="mb-3 text-sm text-amber-700">Select a branch before adding items.</p>
        )}

        <div className="space-y-2">
          {lines.map((line, i) => (
            <div key={line.id} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-center text-xs text-muted">{i + 1}</span>
              <ItemSearchInput
                value={line.name}
                selected={toSelected(line)}
                unverified={line.unverified}
                onQueryChange={(q) => {
                  updateLine(i, {
                    name: q,
                    ...(line.inventoryItemId && q !== line.name
                      ? { inventoryItemId: undefined, unverified: false, category: "TRADING_ITEM" }
                      : {}),
                  });
                }}
                onSelect={(item) => {
                  if (item) {
                    updateLine(i, {
                      name: item.name,
                      inventoryItemId: item.id,
                      category: item.category,
                      unverified: false,
                    });
                  } else {
                    updateLine(i, { inventoryItemId: undefined, unverified: true });
                  }
                }}
                onUnverifiedChange={(v) => updateLine(i, { unverified: v })}
                inputRef={(el) => {
                  rowNameRefs.current[i] = el;
                }}
                onEnterNext={() => {
                  if (i < lines.length - 1) {
                    rowNameRefs.current[i + 1]?.focus();
                  } else {
                    itemRef.current?.focus();
                  }
                }}
                onEscape={() => {
                  const blank = !line.name.trim() && !line.inventoryItemId && !line.unverified;
                  if (blank) {
                    removeLine(i);
                    if (i > 0) {
                      setTimeout(() => rowNameRefs.current[i - 1]?.focus(), 0);
                    } else {
                      setTimeout(() => itemRef.current?.focus(), 0);
                    }
                    return;
                  }
                  if (i > 0) {
                    rowNameRefs.current[i - 1]?.focus();
                  } else {
                    itemRef.current?.focus();
                  }
                }}
                className="min-w-0 flex-1"
              />
              <Badge status={line.category} className="mt-1 shrink-0" />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-0.5 shrink-0 text-xs text-muted hover:text-red-600"
                onClick={() => {
                  removeLine(i);
                  if (lines.length <= 1) {
                    setTimeout(() => itemRef.current?.focus(), 0);
                  } else if (i > 0) {
                    setTimeout(() => rowNameRefs.current[i - 1]?.focus(), 0);
                  } else {
                    setTimeout(() => rowNameRefs.current[0]?.focus(), 0);
                  }
                }}
              >
                Remove
              </Button>
            </div>
          ))}

          <div className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 text-center text-xs text-muted">
              {lines.length + 1}
            </span>
            <ItemSearchInput
              value={itemQuery}
              selected={selectedItem}
              unverified={unverified}
              onQueryChange={(q) => {
                syncAddRowRef({ itemQuery: q });
                setItemQuery(q);
              }}
              onSelect={(item) => {
                syncAddRowRef({ selectedItem: item });
                setSelectedItem(item);
              }}
              onUnverifiedChange={(v) => {
                syncAddRowRef({ unverified: v });
                setUnverified(v);
              }}
              inputRef={itemRef}
              onEnterNext={() => {
                commitAddRow();
              }}
              onEscape={() => {
                const { itemQuery: q, selectedItem: sel, unverified: uv } = addRowRef.current;
                const blank = !q.trim() && !sel && !uv;
                if (blank && lines.length > 0) {
                  rowNameRefs.current[lines.length - 1]?.focus();
                }
              }}
              className="min-w-0 flex-1"
            />
            {activeCategory && <Badge status={activeCategory} className="mt-1 shrink-0" />}
            <span className="mt-0.5 w-[68px] shrink-0" aria-hidden />
          </div>
        </div>

        {manualError && <p className="mt-2 text-sm text-amber-800">{manualError}</p>}
      </Modal>
    </div>
  );
}
