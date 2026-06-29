"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import html2canvas from "html2canvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/fetcher";
import { formatQty, shortId } from "@/lib/utils";
import { Skeleton, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api<{ order: Record<string, unknown> }>(`/api/orders/${id}`)
      .then((d) => setOrder(d.order))
      .finally(() => setLoading(false));
  }, [id]);

  const load = () => {
    api<{ order: Record<string, unknown> }>(`/api/orders/${id}`).then((d) => setOrder(d.order));
  };

  const toast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  if (loading || !order) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <Card title="Order Items">
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Category</TH>
                <TH>Qty</TH>
              </TR>
            </THead>
            <SkeletonTable rows={5} cols={3} />
          </Table>
        </Card>
      </div>
    );
  }

  const items = order.items as Array<Record<string, unknown>>;
  const reservations = order.reservations as Array<Record<string, unknown>>;
  const branch = order.branch as { name: string; code: string; address?: string; phone?: string };
  const status = order.status as string;
  const canEdit = ["PENDING", "DRAFT"].includes(status);

  const handleAction = async (action: "submit" | "cancel") => {
    if (action === "cancel" && !confirm("Cancel order?")) return;
    if (action === "submit" && !confirm("Submit and deduct stock?")) return;
    await api(`/api/orders/${id}/${action}`, { method: "POST" });
    load();
  };

  const reservationItemName = (r: Record<string, unknown>) => {
    const orderItem = r.orderItem as { itemNameSnapshot?: string } | undefined;
    const inv = r.inventoryItem as { name?: string } | undefined;
    return orderItem?.itemNameSnapshot || inv?.name || "Unknown item";
  };

  const sendReceiptOnWhatsApp = async () => {
    if (!receiptRef.current) return;
    const canvas = await html2canvas(receiptRef.current);
    const imageBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );
    if (!imageBlob) return;

    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": imageBlob }),
    ]);

    const phone = (order.customerPhone as string).replace(/\D/g, "");
    const number = phone.startsWith("91") ? phone : `91${phone}`;
    window.open(`https://web.whatsapp.com/send?phone=${number}`, "_blank");

    toast("WhatsApp opening... receipt will paste automatically. Just click Send.");
  };

  return (
    <div className="space-y-4">
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          {toastMsg}
        </div>
      )}

      <div
        ref={receiptRef}
        style={{
          position: "absolute",
          left: "-9999px",
          background: "white",
          padding: "40px",
          width: "600px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "bold" }}>Titabor Udyog</h2>
          <p style={{ margin: "4px 0", fontSize: "13px", color: "#555" }}>Delivery Challan / Receipt</p>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", fontSize: "14px" }}>
          <div>
            <strong>From:</strong>
            <br />
            Main Factory
            <br />
            <span style={{ color: "#555" }}>Titiabar, Assam</span>
            <br />
            <span style={{ color: "#555" }}>9876543210</span>
          </div>
          <div>
            <strong>To:</strong>
            <br />
            {order.customerName as string}
            <br />
            {order.customerPhone as string}
          </div>
        </div>

        <div style={{ marginBottom: "16px", fontSize: "14px" }}>
          <strong>Order #:</strong> {order.orderNumber as string} &nbsp;&nbsp;
          <strong>Date:</strong> {new Date(order.createdAt as string).toLocaleDateString()}
          <br />
          <strong>Status:</strong> {order.status as string}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", marginBottom: "24px" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #000" }}>
              <th style={{ textAlign: "left", padding: "8px" }}>#</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Item</th>
              <th style={{ textAlign: "left", padding: "8px" }}>Unit</th>
              <th style={{ textAlign: "right", padding: "8px" }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id as string} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "8px" }}>{i + 1}</td>
                <td style={{ padding: "8px" }}>{item.itemNameSnapshot as string}</td>
                <td style={{ padding: "8px" }}>{item.unitSnapshot as string}</td>
                <td style={{ padding: "8px", textAlign: "right" }}>{formatQty(Number(item.quantity))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{order.orderNumber as string}</h1>
          <Badge status={status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link href={`/orders/${id}/edit`}>
              <Button variant="secondary">Edit Order</Button>
            </Link>
          )}
          {status === "PENDING" && (
            <>
              <Button onClick={() => handleAction("submit")}>Submit Order</Button>
              <Button variant="danger" onClick={() => handleAction("cancel")}>Cancel</Button>
            </>
          )}
          <Link href={`/orders/${id}/print`}>
            <Button variant="secondary">Print Challan</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Branch">
          <p className="font-medium">{branch.name} ({branch.code})</p>
          <p className="text-sm text-muted">{branch.address}</p>
          <p className="text-sm text-muted">{branch.phone}</p>
        </Card>
        <Card title="Customer">
          <p className="font-medium">{order.customerName as string}</p>
          <p className="text-sm">{order.customerPhone as string}</p>
          <p className="text-sm text-muted">{order.customerAddress as string}</p>
          {order.remarks ? (
            <p className="mt-2 text-sm text-muted">Remarks: {order.remarks as string}</p>
          ) : null}
          <Button
            onClick={sendReceiptOnWhatsApp}
            className="mt-3 h-9 bg-[#25D366] text-white hover:bg-[#1da851]"
          >
            Send on WhatsApp
          </Button>
        </Card>
      </div>

      <Card title="Order Items">
        <Table>
          <THead>
            <TR>
              <TH>Item</TH>
              <TH>Category</TH>
              <TH>Qty</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((item) => (
              <TR key={item.id as string}>
                <TD>{item.itemNameSnapshot as string} ({item.unitSnapshot as string})</TD>
                <TD><Badge status={item.category as string} /></TD>
                <TD>{formatQty(Number(item.quantity))}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {reservations.length > 0 && (
        <Card title="Stock Reservations">
          <Table>
            <THead>
              <TR>
                <TH>Item</TH>
                <TH>Reserved Qty</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {reservations.map((r) => (
                <TR key={r.id as string}>
                  <TD>
                    <span className="font-medium">{reservationItemName(r)}</span>
                    <span className="ml-2 text-xs text-muted">
                      #{shortId(r.inventoryItemId as string)}
                    </span>
                  </TD>
                  <TD>{formatQty(Number(r.quantity))}</TD>
                  <TD><Badge status={r.status as string} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
