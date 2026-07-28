"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SkeletonTable } from "@/components/ui/skeleton";
import { formatOrderDate, formatQty } from "@/lib/utils";

export interface StockOrderRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  createdAt: string;
  createdBy: string;
}

export function StockOrdersModal({
  open,
  onClose,
  title,
  loading,
  reservations,
  emptyMessage,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  loading: boolean;
  reservations: StockOrderRow[];
  emptyMessage?: string;
}) {
  const router = useRouter();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
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
          <SkeletonTable rows={3} cols={6} />
        </Table>
      ) : reservations.length === 0 ? (
        emptyMessage ? <p className="text-sm text-muted">{emptyMessage}</p> : null
      ) : (
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
            {reservations.map((r) => (
              <TR
                key={r.orderId}
                className="cursor-pointer"
                onClick={() => {
                  onClose();
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
      )}
    </Modal>
  );
}
