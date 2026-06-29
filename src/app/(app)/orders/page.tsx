"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BranchSelector } from "@/components/branch-selector";
import { Modal } from "@/components/ui/modal";
import { api, ApiError } from "@/lib/fetcher";
import { SkeletonTable } from "@/components/ui/skeleton";

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: string;
  createdAt: string;
  branch: { name: string; code: string };
  _count?: { items: number };
}

type ConfirmAction =
  | { type: "cancel"; order: Order }
  | { type: "delete"; order: Order }
  | { type: "submit"; order: Order };

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: "50" });
    if (branchId) params.set("branchId", branchId);
    if (status) params.set("status", status);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (day) params.set("day", day);
    if (month) params.set("month", month);
    if (year) params.set("year", year);
    try {
      const data = await api<{ orders: Order[] }>(`/api/orders?${params}`);
      setOrders(data.orders);
    } finally {
      setLoading(false);
    }
  }, [branchId, status, debouncedSearch, day, month, year]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = (e: React.MouseEvent, order: Order, action: "submit" | "cancel") => {
    e.stopPropagation();
    setConfirmError(null);
    setConfirmAction({ type: action, order });
  };

  const handleDelete = (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    setConfirmError(null);
    setConfirmAction({ type: "delete", order });
  };

  const closeConfirm = () => {
    if (confirmLoading) return;
    setConfirmAction(null);
    setConfirmError(null);
  };

  const runConfirmAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      if (confirmAction.type === "delete") {
        await api(`/api/orders/${confirmAction.order.id}`, { method: "DELETE" });
      } else {
        await api(`/api/orders/${confirmAction.order.id}/${confirmAction.type}`, {
          method: "POST",
        });
      }
      setConfirmAction(null);
      await load();
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : "Action failed");
    } finally {
      setConfirmLoading(false);
    }
  };

  const confirmCopy = (() => {
    if (!confirmAction) return null;
    const { order } = confirmAction;
    if (confirmAction.type === "cancel") {
      return {
        title: "Cancel order?",
        message: `Cancel order ${order.orderNumber} for ${order.customerName}? Reserved stock will be released.`,
        confirmLabel: "Cancel Order",
        confirmVariant: "danger" as const,
      };
    }
    if (confirmAction.type === "delete") {
      return {
        title: "Delete order?",
        message:
          order.status === "SUBMITTED"
            ? `Delete order ${order.orderNumber} permanently? Stock for this order will be restored.`
            : `Delete order ${order.orderNumber} permanently? This cannot be undone.`,
        confirmLabel: "Delete Order",
        confirmVariant: "danger" as const,
      };
    }
    return {
      title: "Submit order?",
      message: `Submit order ${order.orderNumber}? Stock will be deducted from inventory.`,
      confirmLabel: "Submit Order",
      confirmVariant: "primary" as const,
    };
  })();

  const stopNav = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="space-y-4">
      <Modal
        open={!!confirmAction}
        onClose={closeConfirm}
        title={confirmCopy?.title ?? "Confirm"}
        footer={
          <>
            <Button variant="ghost" onClick={closeConfirm} disabled={confirmLoading}>
              Keep Order
            </Button>
            <Button
              variant={confirmCopy?.confirmVariant === "danger" ? "danger" : "primary"}
              onClick={runConfirmAction}
              disabled={confirmLoading}
            >
              {confirmLoading ? "Please wait..." : confirmCopy?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{confirmCopy?.message}</p>
        {confirmError && (
          <p className="mt-3 text-sm text-red-600">{confirmError}</p>
        )}
      </Modal>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Orders</h1>
          <p className="text-sm text-muted">Click a row to open the full order</p>
        </div>
        <Link href="/orders/new">
          <Button>Create Order</Button>
        </Link>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3">
        <BranchSelector value={branchId} onChange={setBranchId} className="w-48" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="DRAFT">Draft</option>
        </Select>
        <Input
          placeholder="Search order/customer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
        <Select value={day} onChange={(e) => setDay(e.target.value)} className="w-20">
          <option value="">Day</option>
          {Array.from({ length: 31 }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>
              {i + 1}
            </option>
          ))}
        </Select>
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-32">
          <option value="">All Months</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>
              {new Date(2000, i).toLocaleString("en", { month: "short" })}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-24"
          placeholder="Year"
        />
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Order #</TH>
              <TH>Branch</TH>
              <TH>Customer</TH>
              <TH>Status</TH>
              <TH>Items</TH>
              <TH>Date</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          {loading ? (
            <SkeletonTable rows={8} cols={7} />
          ) : orders.length === 0 ? (
            <tbody>
              <TR>
                <TD colSpan={7} className="text-muted">
                  No orders found
                </TD>
              </TR>
            </tbody>
          ) : (
            <TBody>
              {orders.map((o) => (
                <TR
                  key={o.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/orders/${o.id}`)}
                >
                  <TD className="font-medium text-primary">{o.orderNumber}</TD>
                  <TD>{o.branch.code}</TD>
                  <TD>
                    <div>{o.customerName}</div>
                    <div className="text-xs text-muted">{o.customerPhone}</div>
                  </TD>
                  <TD>
                    <Badge status={o.status} />
                  </TD>
                  <TD>{o._count?.items ?? "—"}</TD>
                  <TD className="text-xs">{new Date(o.createdAt).toLocaleDateString()}</TD>
                  <TD onClick={stopNav}>
                    <div className="flex flex-wrap gap-1">
                      {["PENDING", "DRAFT"].includes(o.status) && (
                        <Link href={`/orders/${o.id}/edit`}>
                          <Button size="sm" variant="ghost">
                            Edit
                          </Button>
                        </Link>
                      )}
                      {o.status === "PENDING" && (
                        <>
                          <Button size="sm" onClick={(e) => handleAction(e, o, "submit")}>
                            Submit
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={(e) => handleAction(e, o, "cancel")}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                      <Link href={`/orders/${o.id}/print`}>
                        <Button size="sm" variant="secondary">
                          Print
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={(e) => handleDelete(e, o)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          )}
        </Table>
      </Card>
    </div>
  );
}
