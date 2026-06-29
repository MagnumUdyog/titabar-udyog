"use client";

import { useEffect, useState, use } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { formatOrderPrice, formatOrderAmount, orderGrandTotal, orderLineTotal } from "@/lib/order-price";
import { formatQty } from "@/lib/utils";

interface Challan {
  orderNumber: string;
  status: string;
  branch: { name: string; code: string; address?: string; phone?: string };
  customer: { name: string; phone: string; address?: string };
  items: Array<{
    name: string;
    unit: string;
    quantity: number;
    price: number | null;
    lineTotal: number | null;
    category: string;
  }>;
  totalAmount: number;
  remarks?: string;
  createdAt: string;
  submittedAt?: string;
  createdBy: string;
  submittedBy?: string;
}

export default function PrintChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [challan, setChallan] = useState<Challan | null>(null);

  useEffect(() => {
    api<{ challan: Challan }>(`/api/orders/${id}/print`).then((d) => setChallan(d.challan));
  }, [id]);

  if (!challan) return <p className="p-6 text-sm text-muted">Loading challan...</p>;

  const grandTotal = orderGrandTotal(
    challan.items.map((item) => ({ quantity: item.quantity, price: item.price }))
  );

  return (
    <div>
      <div className="no-print mb-4 flex gap-2 p-4">
        <Button onClick={() => window.print()}>Print</Button>
        <Button variant="secondary" onClick={() => window.history.back()}>Back</Button>
      </div>

      <div className="mx-auto max-w-2xl border border-border bg-white p-8 print:max-w-none print:border-0">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Titabor Udyog</h1>
          <p className="text-sm text-muted">Delivery Challan / Receipt</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-semibold">From:</p>
            <p>{challan.branch.name}</p>
            <p className="text-muted">{challan.branch.address}</p>
            <p className="text-muted">{challan.branch.phone}</p>
          </div>
          <div>
            <p className="font-semibold">To:</p>
            <p>{challan.customer.name}</p>
            <p>{challan.customer.phone}</p>
            <p className="text-muted">{challan.customer.address}</p>
          </div>
        </div>

        <div className="mb-4 flex justify-between text-sm">
          <div>
            <p><strong>Order #:</strong> {challan.orderNumber}</p>
            <p><strong>Status:</strong> {challan.status}</p>
          </div>
          <div className="text-right">
            <p><strong>Date:</strong> {new Date(challan.createdAt).toLocaleDateString()}</p>
            {challan.submittedAt && (
              <p><strong>Submitted:</strong> {new Date(challan.submittedAt).toLocaleDateString()}</p>
            )}
          </div>
        </div>

        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="w-8 py-2 text-left">#</th>
              <th className="text-left">Item</th>
              <th className="w-16 px-2 text-right">Unit</th>
              <th className="w-16 px-2 text-right">Qty</th>
              <th className="w-24 px-2 text-right">Price (₹)</th>
              <th className="w-24 px-2 text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {challan.items.map((item, i) => {
              const lineTotal = orderLineTotal(item.quantity, item.price);
              return (
                <tr key={i} className="border-b border-gray-300">
                  <td className="py-2">{i + 1}</td>
                  <td>{item.name}</td>
                  <td className="px-2 text-right">{item.unit}</td>
                  <td className="px-2 text-right">{formatQty(item.quantity)}</td>
                  <td className="px-2 text-right">
                    {item.price != null ? `₹${item.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-2 text-right">
                    {lineTotal != null ? `₹${lineTotal.toFixed(2)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mb-4 text-right text-sm font-bold">
          Grand Total: {formatOrderAmount(grandTotal)}
        </div>

        {challan.remarks && (
          <p className="mb-4 text-sm"><strong>Remarks:</strong> {challan.remarks}</p>
        )}

        <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
          <div className="border-t border-black pt-2 text-center">
            <p>Prepared by: {challan.createdBy}</p>
            <p className="mt-8">Signature</p>
          </div>
          <div className="border-t border-black pt-2 text-center">
            <p>Received by</p>
            <p className="mt-8">Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
}
