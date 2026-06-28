"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BranchSelector } from "@/components/branch-selector";
import {
  CustomerSearchInput,
  type CustomerSuggestion,
} from "@/components/orders/customer-search-input";
import {
  ItemSearchInput,
  type InventorySearchItem,
} from "@/components/orders/item-search-input";
import { api, ApiError } from "@/lib/fetcher";
import { cn, formatQty, formatUnit } from "@/lib/utils";

interface PastOrder {
  id: string;
  createdAt: string;
  items: Array<{
    itemId: string;
    itemName: string;
    unit: string;
    category: string;
    qty: number;
  }>;
}

interface CustomerData {
  customer: { name: string; phone: string; address: string };
  orders: PastOrder[];
}

interface OrderLine {
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

interface OrderStockWarning {
  inventoryItemId: string;
  itemName: string;
  availableQty: number;
  requestedQty: number;
  moq: number;
  exceedsStock: boolean;
  lowStock: boolean;
}

const focusInput = "h-8 text-sm";

const CREATE_ORDER_DRAFT_KEY = "create-order-draft";

interface CreateOrderDraft {
  branchId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  lines: OrderLine[];
  itemQuery: string;
  selectedItem: InventorySearchItem | null;
  unverified: boolean;
  qty: string;
}

function loadCreateOrderDraft(): CreateOrderDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CREATE_ORDER_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CreateOrderDraft;
  } catch {
    return null;
  }
}

function clearCreateOrderDraft() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(CREATE_ORDER_DRAFT_KEY);
  }
}

export default function NewOrderPage() {
  const router = useRouter();
  const branchRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const rowNameRefs = useRef<(HTMLInputElement | null)[]>([]);
  const rowQtyRefs = useRef<(HTMLInputElement | null)[]>([]);
  const addRef = useRef<HTMLButtonElement>(null);
  const recentOrdersRef = useRef<HTMLDivElement>(null);
  const phoneCache = useRef(new Map<string, CustomerData>());
  const draftHydrated = useRef(false);

  const [branchId, setBranchId] = useState("");
  const [showBranchField, setShowBranchField] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const [lines, setLines] = useState<OrderLine[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<InventorySearchItem | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [qty, setQty] = useState("");

  const [recentOrders, setRecentOrders] = useState<PastOrder[]>([]);
  const [customerLookupDone, setCustomerLookupDone] = useState(false);
  const [selectedOrderIdx, setSelectedOrderIdx] = useState(0);
  const [recentOrdersActive, setRecentOrdersActive] = useState(false);
  const [activeCustomerField, setActiveCustomerField] = useState<"name" | "phone" | null>(null);

  const [lineWarnings, setLineWarnings] = useState<Record<number, { lowStock: boolean }>>({});
  const [stockWarning, setStockWarning] = useState<{
    lineIndex: number;
    itemName: string;
    requested: number;
    available: number;
    isAddRow?: boolean;
  } | null>(null);
  const stockWarningModalRef = useRef<HTMLDivElement>(null);
  const itemNotFoundModalRef = useRef<HTMLDivElement>(null);
  const [itemNotFound, setItemNotFound] = useState<{
    lineIndex: number;
    name: string;
  } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const phoneDigits = customerPhone.replace(/\D/g, "");
  const showRecentOrders = phoneDigits.length >= 10 && customerLookupDone;

  const loadCustomerOrders = useCallback(async (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return;
    try {
      let data = phoneCache.current.get(digits);
      if (!data) {
        data = await api<CustomerData>(`/api/customers/${encodeURIComponent(phone)}`);
        phoneCache.current.set(digits, data);
      }
      setRecentOrders(data.orders);
      setSelectedOrderIdx(0);
      setCustomerLookupDone(true);
    } catch {
      setRecentOrders([]);
      setCustomerLookupDone(true);
    }
  }, []);

  useEffect(() => {
    api<{ user: { role: string; branchId: string | null } }>("/api/auth/me").then((d) => {
      setShowBranchField(d.user.role === "ADMIN");
      const draft = loadCreateOrderDraft();
      if (draft) {
        if (d.user.role === "ADMIN") {
          setBranchId(draft.branchId || "");
        } else if (d.user.branchId) {
          setBranchId(d.user.branchId);
        }
        setCustomerName(draft.customerName);
        setCustomerPhone(draft.customerPhone);
        setCustomerAddress(draft.customerAddress);
        setLines(draft.lines);
        setItemQuery(draft.itemQuery);
        setSelectedItem(draft.selectedItem);
        setUnverified(draft.unverified);
        setQty(draft.qty);
        if (draft.customerPhone.trim().length >= 10) {
          void loadCustomerOrders(draft.customerPhone);
        }
      } else if (d.user.role === "BRANCH_USER" && d.user.branchId) {
        setBranchId(d.user.branchId);
      }
      draftHydrated.current = true;
    });
  }, [loadCustomerOrders]);

  useEffect(() => {
    if (!draftHydrated.current) return;
    const draft: CreateOrderDraft = {
      branchId,
      customerName,
      customerPhone,
      customerAddress,
      lines,
      itemQuery,
      selectedItem,
      unverified,
      qty,
    };
    sessionStorage.setItem(CREATE_ORDER_DRAFT_KEY, JSON.stringify(draft));
  }, [
    branchId,
    customerName,
    customerPhone,
    customerAddress,
    lines,
    itemQuery,
    selectedItem,
    unverified,
    qty,
  ]);

  const onCustomerSelect = (c: CustomerSuggestion) => {
    setActiveCustomerField(null);
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerAddress(c.address);
    loadCustomerOrders(c.phone);
  };

  const applyPastOrder = (order: PastOrder) => {
    setLines(
      order.items.map((item) => ({
        inventoryItemId: item.itemId,
        name: item.itemName,
        unit: item.unit,
        category: item.category,
        quantity: item.qty,
        unverified: false,
        savedName: item.itemName,
        savedQty: item.qty,
        savedInventoryItemId: item.itemId,
        savedUnverified: false,
      }))
    );
    setRecentOrdersActive(false);
    setFormError(null);
    setTimeout(() => itemRef.current?.focus(), 0);
  };

  const onRecentOrdersKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedOrderIdx((i) => Math.min(i + 1, recentOrders.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedOrderIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && recentOrders[selectedOrderIdx]) {
      e.preventDefault();
      applyPastOrder(recentOrders[selectedOrderIdx]);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setRecentOrdersActive(false);
      itemRef.current?.focus();
    }
    if (e.key === "Home") {
      e.preventDefault();
      setRecentOrdersActive(false);
      addressRef.current?.focus();
    }
    if (e.key === "End") {
      e.preventDefault();
      setRecentOrdersActive(false);
      itemRef.current?.focus();
    }
  };

  const activeCategory = selectedItem?.category ?? (unverified ? "TRADING_ITEM" : "");
  const activeUnit = selectedItem?.unit ?? null;
  const activeUnitLabel = formatUnit(activeUnit);

  const focus = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.focus();
  };

  const onFieldKeyDown = (
    e: React.KeyboardEvent,
    opts: {
      value: string;
      onClear: () => void;
      next?: React.RefObject<HTMLElement | null>;
      prev?: React.RefObject<HTMLElement | null>;
    }
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (opts.next) focus(opts.next);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (opts.value) opts.onClear();
      else if (opts.prev) focus(opts.prev);
    }
  };

  const clearAddRow = () => {
    setItemQuery("");
    setSelectedItem(null);
    setUnverified(false);
    setQty("");
  };

  const focusAddress = () => {
    addressRef.current?.focus();
  };

  const focusFirstItem = () => {
    if (lines.length > 0) rowNameRefs.current[0]?.focus();
    else itemRef.current?.focus();
  };

  const focusLastLineQty = () => {
    if (lines.length > 0) rowQtyRefs.current[lines.length - 1]?.focus();
    else focusAddress();
  };

  const tryStockWarning = async (
    lineIndex: number,
    inventoryItemId: string | undefined,
    itemName: string,
    quantity: number,
    isAddRow = false
  ): Promise<boolean> => {
    if (!branchId || !inventoryItemId || quantity <= 0) return true;
    try {
      const data = await api<{
        availability: Record<string, number>;
      }>("/api/orders/stock-warnings", {
        method: "POST",
        body: JSON.stringify({
          branchId,
          items: [{ inventoryItemId, quantity, itemName }],
        }),
      });
      const available = data.availability?.[inventoryItemId] ?? 0;
      if (quantity > available) {
        setStockWarning({
          lineIndex,
          itemName,
          requested: quantity,
          available,
          isAddRow,
        });
        return false;
      }
    } catch {
      /* proceed if check fails */
    }
    return true;
  };

  const onItemsHomeEnd = (e: React.KeyboardEvent) => {
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      focusAddress();
    }
  };

  const updateLine = (index: number, patch: Partial<OrderLine>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setTimeout(() => {
        if (next.length === 0) {
          itemRef.current?.focus();
        } else if (index > 0) {
          rowQtyRefs.current[Math.min(index - 1, next.length - 1)]?.focus();
        } else {
          rowNameRefs.current[0]?.focus();
        }
      }, 0);
      return next;
    });
  };

  const handleLineQtyChange = (index: number, rawValue: string) => {
    if (rawValue !== "" && !/^\d+$/.test(rawValue)) return;
    updateLine(index, { quantity: rawValue === "" ? 0 : parseInt(rawValue, 10) });
  };

  const validateRowItemOnEnter = async (index: number): Promise<boolean> => {
    const line = lines[index];
    const name = line.name.trim();
    if (!name) {
      setItemNotFound({ lineIndex: index, name: "" });
      return false;
    }
    if (line.name === line.savedName && line.inventoryItemId && !line.unverified) {
      return true;
    }

    try {
      const data = await api<{ results: InventorySearchItem[] }>(
        `/api/inventory/search?q=${encodeURIComponent(name)}&categories=FINISHED_GOOD,TRADING_ITEM`
      );
      const exact = data.results.find((r) => r.name.toLowerCase() === name.toLowerCase());
      if (exact) {
        updateLine(index, {
          name: exact.name,
          inventoryItemId: exact.id,
          unit: exact.unit,
          category: exact.category,
          unverified: false,
        });
        return true;
      }
      setItemNotFound({ lineIndex: index, name });
      return false;
    } catch {
      setItemNotFound({ lineIndex: index, name });
      return false;
    }
  };

  const dismissStockWarning = () => {
    if (!stockWarning) return;
    const { lineIndex, isAddRow } = stockWarning;
    if (!isAddRow) {
      const saved = lines[lineIndex]?.savedQty;
      if (saved !== undefined) updateLine(lineIndex, { quantity: saved });
    }
    setStockWarning(null);
    setTimeout(() => {
      if (isAddRow) qtyRef.current?.focus();
      else rowQtyRefs.current[lineIndex]?.focus();
    }, 0);
  };

  const confirmRequestedStock = () => {
    if (!stockWarning) return;
    const { lineIndex, requested, isAddRow } = stockWarning;
    setStockWarning(null);
    if (isAddRow) {
      addLine(requested);
      setTimeout(() => itemRef.current?.focus(), 0);
    } else {
      updateLine(lineIndex, { quantity: requested, savedQty: requested });
      setTimeout(() => rowQtyRefs.current[lineIndex]?.focus(), 0);
    }
  };

  const stockCheckItems = useCallback(
    () =>
      lines
        .filter((l) => l.inventoryItemId)
        .map((l) => ({
          inventoryItemId: l.inventoryItemId!,
          quantity: l.quantity,
          itemName: l.name,
        })),
    [lines]
  );

  useEffect(() => {
    if (!branchId) {
      setLineWarnings({});
      return;
    }
    const items = stockCheckItems();
    if (items.length === 0) {
      setLineWarnings({});
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api<{
          warnings: OrderStockWarning[];
          availability: Record<string, number>;
        }>("/api/orders/stock-warnings", {
          method: "POST",
          body: JSON.stringify({ branchId, items }),
        });
        const byId = new Map(data.warnings.map((w) => [w.inventoryItemId, w]));
        const mapped: Record<number, { lowStock: boolean }> = {};
        lines.forEach((l, i) => {
          if (l.inventoryItemId && byId.has(l.inventoryItemId)) {
            const w = byId.get(l.inventoryItemId)!;
            if (w.lowStock) mapped[i] = { lowStock: true };
          }
        });
        setLineWarnings(mapped);
      } catch {
        setLineWarnings({});
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [branchId, lines, stockCheckItems]);

  const addLine = useCallback((overrideQty?: number) => {
    const name = selectedItem?.name ?? itemQuery.trim();
    const quantity = overrideQty ?? parseFloat(qty);
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
        unit: activeUnit ?? "",
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
    clearAddRow();
    setTimeout(() => itemRef.current?.focus(), 0);
  }, [selectedItem, itemQuery, qty, unverified, activeUnit, activeCategory]);

  useEffect(() => {
    if (!stockWarning) return;
    const warning = stockWarning;
    const savedQty = lines[warning.lineIndex]?.savedQty;
    setTimeout(() => stockWarningModalRef.current?.focus(), 0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setStockWarning(null);
        if (warning.isAddRow) {
          addLine(warning.requested);
          setTimeout(() => itemRef.current?.focus(), 0);
        } else {
          updateLine(warning.lineIndex, {
            quantity: warning.requested,
            savedQty: warning.requested,
          });
          setTimeout(() => rowQtyRefs.current[warning.lineIndex]?.focus(), 0);
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setStockWarning(null);
        if (!warning.isAddRow && savedQty !== undefined) {
          updateLine(warning.lineIndex, { quantity: savedQty });
        }
        setTimeout(() => {
          if (warning.isAddRow) qtyRef.current?.focus();
          else rowQtyRefs.current[warning.lineIndex]?.focus();
        }, 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stockWarning, lines, addLine]);

  useEffect(() => {
    if (!itemNotFound) return;
    const idx = itemNotFound.lineIndex;
    setTimeout(() => itemNotFoundModalRef.current?.focus(), 0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        setItemNotFound(null);
        setTimeout(() => rowNameRefs.current[idx]?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [itemNotFound]);

  const submitOrder = async (forceCreate = false) => {
    setSubmitting(true);
    try {
      const data = await api<{ order: { id: string } }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          branchId,
          customerName,
          customerPhone,
          customerAddress,
          status: "PENDING",
          forceCreate,
          items: lines.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            itemName: l.unverified || !l.inventoryItemId ? l.name : undefined,
            category: l.category,
            quantity: l.quantity,
          })),
        }),
      });
      clearCreateOrderDraft();
      router.push(`/orders/${data.order.id}`);
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateOrder = async () => {
    setFormError(null);
    if (!branchId) {
      setFormError("Select a branch");
      return;
    }
    if (!customerName.trim()) {
      setFormError("Customer name is required");
      focus(nameRef);
      return;
    }
    if (customerPhone.trim().length < 10) {
      setFormError("Valid phone number is required");
      focus(phoneRef);
      return;
    }
    if (lines.length === 0) {
      setFormError("Add at least one item");
      focus(itemRef);
      return;
    }

    await submitOrder(false);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-xl font-bold">Create Order</h1>
        <p className="text-xs text-muted">
          Keyboard: Enter → next · Esc → clear / back
        </p>
      </div>

      {itemNotFound && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div
            ref={itemNotFoundModalRef}
            tabIndex={-1}
            className="w-[380px] rounded-xl bg-white p-7 shadow-2xl outline-none"
          >
            <div className="mb-4 text-center text-4xl">❌</div>
            <h3 className="mb-2 text-center text-[17px] font-bold text-gray-900">Item Not Found</h3>
            <p className="mb-5 text-center text-sm leading-relaxed text-gray-500">
              {itemNotFound.name ? (
                <>
                  <strong>{itemNotFound.name}</strong> was not found in the master list.
                </>
              ) : (
                "Please enter an item name."
              )}
              <br />
              Please check the spelling and try again.
            </p>
            <button
              type="button"
              autoFocus
              onClick={() => {
                const idx = itemNotFound.lineIndex;
                setItemNotFound(null);
                setTimeout(() => rowNameRefs.current[idx]?.focus(), 0);
              }}
              className="w-full cursor-pointer rounded-lg border-none bg-blue-600 px-2.5 py-2.5 text-[13px] font-semibold text-white"
            >
              OK
            </button>
            <p className="mb-0 mt-3 text-center text-[11px] text-gray-400">
              Press Enter or Esc to dismiss
            </p>
          </div>
        </div>
      )}

      {stockWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div
            ref={stockWarningModalRef}
            tabIndex={-1}
            className="w-[380px] rounded-xl bg-white p-7 shadow-2xl outline-none"
          >
            <div className="mb-4 text-center text-4xl">⚠️</div>
            <h3 className="mb-2 text-center text-[17px] font-bold text-gray-900">
              Stock Is Low
            </h3>
            <p className="mb-5 text-center text-sm leading-relaxed text-gray-500">
              There are only{" "}
              <strong className="text-green-600">{formatQty(stockWarning.available)}</strong>{" "}
              units available for <strong>{stockWarning.itemName}</strong>. Do you want to use{" "}
              <strong className="text-red-600">{formatQty(stockWarning.requested)}</strong> qty
              and continue?
            </p>
            <div className="mb-5">
              <div className="mb-1.5 flex justify-between text-xs text-gray-500">
                <span>Available stock</span>
                <span>{formatQty(stockWarning.available)} units</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-green-600"
                  style={{
                    width: `${Math.min((stockWarning.available / stockWarning.requested) * 100, 100)}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-amber-700">
                If submitted, stock may become{" "}
                <strong>{formatQty(stockWarning.available - stockWarning.requested)}</strong>.
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={dismissStockWarning}
                className="flex-1 cursor-pointer rounded-lg border border-gray-200 bg-white px-2.5 py-2.5 text-[13px] font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={confirmRequestedStock}
                className="flex-1 cursor-pointer rounded-lg border-none bg-blue-600 px-2.5 py-2.5 text-[13px] font-semibold text-white"
              >
                Yes, use {formatQty(stockWarning.requested)}
              </button>
            </div>
            <p className="mb-0 mt-3 text-center text-[11px] text-gray-400">
              Enter = Yes · Esc = Cancel
            </p>
          </div>
        </div>
      )}

      {formError && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {formError}
        </p>
      )}

      <Card title="Customer">
        <div className="grid gap-2 sm:grid-cols-2">
          {showBranchField && (
            <div>
              <label className="mb-0.5 block text-xs font-medium text-muted">Branch</label>
              <BranchSelector
                value={branchId}
                onChange={setBranchId}
                allowAll={false}
                selectRef={branchRef}
                onKeyDown={(e) =>
                  onFieldKeyDown(e, {
                    value: branchId,
                    onClear: () => setBranchId(""),
                    next: nameRef,
                  })
                }
                className={focusInput}
              />
            </div>
          )}
          <div>
            <label className="mb-0.5 block text-xs font-medium text-muted">Customer Name</label>
            <CustomerSearchInput
              field="name"
              value={customerName}
              onChange={setCustomerName}
              onSelect={onCustomerSelect}
              activeField={activeCustomerField}
              onActivate={setActiveCustomerField}
              inputRef={nameRef}
              onEnterNext={() => phoneRef.current?.focus()}
              onEscape={() => branchRef.current?.focus()}
              onGoBack={() => branchRef.current?.focus()}
              className={focusInput}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-muted">WhatsApp / Phone</label>
            <CustomerSearchInput
              field="phone"
              value={customerPhone}
              onChange={(v) => {
                setCustomerPhone(v);
                if (v.replace(/\D/g, "").length < 10) {
                  setRecentOrders([]);
                  setCustomerLookupDone(false);
                }
              }}
              onSelect={onCustomerSelect}
              activeField={activeCustomerField}
              onActivate={setActiveCustomerField}
              inputRef={phoneRef}
              onEnterNext={() => addressRef.current?.focus()}
              onEscape={() => nameRef.current?.focus()}
              onGoBack={() => nameRef.current?.focus()}
              className={focusInput}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-muted">Address</label>
            <Input
              ref={addressRef}
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  focusFirstItem();
                  return;
                }
                if (
                  (e.key === "Home" || e.key === "End") &&
                  showRecentOrders &&
                  recentOrders.length > 0
                ) {
                  e.preventDefault();
                  setRecentOrdersActive(true);
                  setSelectedOrderIdx(0);
                  setTimeout(() => recentOrdersRef.current?.focus(), 0);
                  return;
                }
                if (e.key === "ArrowDown" && showRecentOrders && recentOrders.length > 0) {
                  e.preventDefault();
                  setRecentOrdersActive(true);
                  setSelectedOrderIdx(0);
                  setTimeout(() => recentOrdersRef.current?.focus(), 0);
                  return;
                }
                onFieldKeyDown(e, {
                  value: customerAddress,
                  onClear: () => setCustomerAddress(""),
                  next: itemRef,
                  prev: phoneRef,
                });
              }}
              className={focusInput}
            />
          </div>
        </div>
      </Card>

      <Card title="Items">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted">
              <th className="w-8 py-1 pr-2">#</th>
              <th className="py-1 pr-2">Item</th>
              <th className="w-14 py-1 pr-2">Unit</th>
              <th className="w-32 py-1 pr-2">Category</th>
              <th className="w-20 py-1 pr-2 text-right">Qty</th>
              <th className="w-28 py-1 pr-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="py-1 pr-2 text-muted">{i + 1}</td>
                <td className="py-1 pr-2">
                  <ItemSearchInput
                    value={l.name}
                    selected={
                      l.inventoryItemId && !l.unverified
                        ? {
                            id: l.inventoryItemId,
                            name: l.name,
                            category: l.category,
                            unit: l.unit,
                          }
                        : null
                    }
                    unverified={l.unverified}
                    onQueryChange={(name) => {
                      setLines((prev) =>
                        prev.map((line, idx) => {
                          if (idx !== i) return line;
                          if (line.inventoryItemId && line.name === name && !line.unverified) {
                            return { ...line, name };
                          }
                          return {
                            ...line,
                            name,
                            inventoryItemId: undefined,
                            unverified: true,
                          };
                        })
                      );
                    }}
                    onSelect={(item) => {
                      if (!item) return;
                      updateLine(i, {
                        name: item.name,
                        inventoryItemId: item.id,
                        unit: item.unit,
                        category: item.category,
                        unverified: false,
                      });
                    }}
                    onUnverifiedChange={(uv) => updateLine(i, { unverified: uv })}
                    inputRef={(el) => {
                      rowNameRefs.current[i] = el;
                    }}
                    categories={["FINISHED_GOOD", "TRADING_ITEM"]}
                    onEnterNext={() => {
                      void validateRowItemOnEnter(i).then((ok) => {
                        if (ok) rowQtyRefs.current[i]?.focus();
                      });
                    }}
                    onEscape={() => {
                      if (i === 0) {
                        addressRef.current?.focus();
                      } else {
                        rowQtyRefs.current[i - 1]?.focus();
                      }
                    }}
                    onGoBack={focusAddress}
                    className="[&_input]:h-7"
                  />
                </td>
                <td className="py-1 pr-2 text-sm text-muted">{formatUnit(l.unit)}</td>
                <td className="py-1 pr-2">
                  <Badge status={l.category} />
                </td>
                <td className="py-1 text-right">
                  <Input
                    ref={(el) => {
                      rowQtyRefs.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    value={l.quantity > 0 ? String(l.quantity) : ""}
                    onChange={(e) => handleLineQtyChange(i, e.target.value)}
                    onKeyDown={(e) => {
                      onItemsHomeEnd(e);
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        const raw = e.currentTarget.value;
                        if (raw !== "" && !/^\d+$/.test(raw)) return;
                        const quantity = raw === "" ? 0 : parseInt(raw, 10);
                        updateLine(i, { quantity, savedQty: quantity });
                        void (async () => {
                          const itemId =
                            l.inventoryItemId ??
                            (l.name === l.savedName ? l.savedInventoryItemId : undefined);
                          const ok = await tryStockWarning(i, itemId, l.name, quantity, false);
                          if (!ok) return;
                          setTimeout(() => {
                            if (i < lines.length - 1) {
                              rowNameRefs.current[i + 1]?.focus();
                            } else {
                              itemRef.current?.focus();
                            }
                          }, 0);
                        })();
                        return;
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        rowNameRefs.current[i]?.focus();
                      }
                    }}
                    className="ml-auto h-7 w-20 text-right text-sm"
                  />
                </td>
                <td className="py-1 pr-2 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {lineWarnings[i]?.lowStock && (
                      <span className="font-medium text-amber-700">LOW STOCK</span>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-muted hover:text-red-600"
                      onClick={() => removeLine(i)}
                    >
                      Remove
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="border-b border-border/60">
              <td className="py-1 pr-2 text-muted">{lines.length + 1}</td>
              <td className="py-1 pr-2">
                <ItemSearchInput
                  value={itemQuery}
                  selected={selectedItem}
                  unverified={unverified}
                  onQueryChange={setItemQuery}
                  onSelect={setSelectedItem}
                  onUnverifiedChange={setUnverified}
                  inputRef={itemRef}
                  onEnterNext={() => qtyRef.current?.focus()}
                  categories={["FINISHED_GOOD", "TRADING_ITEM"]}
                  onGoBack={focusAddress}
                  onEscape={focusLastLineQty}
                />
              </td>
              <td className="py-1 pr-2 text-sm text-muted">{activeUnitLabel}</td>
              <td className="py-1 pr-2">
                {activeCategory ? <Badge status={activeCategory} /> : null}
              </td>
              <td className="py-1 text-right">
                <Input
                  ref={qtyRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="Qty"
                  value={qty}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^\d+$/.test(v)) setQty(v);
                  }}
                  onKeyDown={(e) => {
                    onItemsHomeEnd(e);
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      const name = selectedItem?.name ?? itemQuery.trim();
                      const quantity = parseInt(e.currentTarget.value || qty, 10);
                      if (!name || !quantity || quantity <= 0) {
                        itemRef.current?.focus();
                        return;
                      }
                      void (async () => {
                        const ok = await tryStockWarning(
                          lines.length,
                          selectedItem?.id,
                          name,
                          quantity,
                          true
                        );
                        if (!ok) return;
                        addLine(quantity);
                      })();
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      itemRef.current?.focus();
                    }
                  }}
                  className="ml-auto h-7 w-20 text-right text-sm"
                />
              </td>
              <td className="py-1 pr-2 text-right">
                <Button
                  ref={addRef}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7"
                  onClick={() => addLine()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLine();
                    }
                  }}
                >
                  Add
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      {showRecentOrders && (
        <Card title="Recent Orders">
          <div
            ref={recentOrdersRef}
            tabIndex={0}
            onKeyDown={onRecentOrdersKeyDown}
            onFocus={() => setRecentOrdersActive(true)}
            onBlur={() => setRecentOrdersActive(false)}
            className={cn(
              "max-h-56 space-y-2 overflow-y-auto outline-none",
              recentOrdersActive && "ring-2 ring-primary/30 rounded-md p-1 -m-1"
            )}
          >
            {recentOrders.length === 0 ? (
              <p className="text-sm text-muted">No previous orders</p>
            ) : (
              recentOrders.map((order, i) => (
                <div
                  key={order.id}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-md border p-2 text-sm",
                    i === selectedOrderIdx && recentOrdersActive
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {order.items
                        .map((it) => `${it.itemName} x${formatQty(it.qty)}`)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => applyPastOrder(order)}
                  >
                    Use This Order
                  </Button>
                </div>
              ))
            )}
            {recentOrders.length > 0 && (
              <p className="text-xs text-muted">↑↓ navigate · Enter use · Esc back</p>
            )}
          </div>
        </Card>
      )}

      <div className="flex justify-end gap-2">
        <Button
          onClick={handleCreateOrder}
          disabled={submitting || lines.length === 0}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreateOrder();
            }
          }}
        >
          {submitting ? "Creating..." : "Create Order"}
        </Button>
      </div>
    </div>
  );
}
