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
import { api } from "@/lib/fetcher";
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

  const handleAction = async (e: React.MouseEvent, id: string, action: "submit" | "cancel") => {
    e.stopPropagation();
    if (action === "cancel" && !confirm("Cancel this order? Reserved stock will be released.")) return;
    if (action === "submit" && !confirm("Submit order? Stock will be deducted.")) return;
    await api(`/api/orders/${id}/${action}`, { method: "POST" });
    load();
  };

  const stopNav = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="space-y-4">
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
                          <Button size="sm" onClick={(e) => handleAction(e, o.id, "submit")}>
                            Submit
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={(e) => handleAction(e, o.id, "cancel")}
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
