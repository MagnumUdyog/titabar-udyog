import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatQty } from "@/lib/utils";

type Category = "RAW_MATERIAL" | "FINISHED_GOOD" | "TRADING_ITEM";
export type ReportCategory = Category | "ALL";

const CATEGORY_LABELS: Record<Category, string> = {
  RAW_MATERIAL: "Raw Materials",
  FINISHED_GOOD: "Finished Goods",
  TRADING_ITEM: "Trading Items",
};

function categoryLabel(cat: string) {
  return CATEGORY_LABELS[cat as Category] || cat;
}

interface StockRow {
  name: string;
  category: string;
  onHand: number;
  reserved: number;
  available: number;
}

interface MovementRow {
  date: string;
  itemName: string;
  category: string;
  type: string;
  qty: number;
  note: string;
}

export function generateStockReportPdf(opts: {
  stock: StockRow[];
  movements?: MovementRow[];
  stockCategory: ReportCategory;
  movementCategory: ReportCategory;
}) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Titabor Udyog", 105, 15, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Stock Status Report", 105, 22, { align: "center" });
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 105, 28, { align: "center" });

  autoTable(doc, {
    startY: 35,
    head: [["#", "Item", "Category", "On Hand", "Reserved", "Available"]],
    body: opts.stock.map((item, i) => [
      i + 1,
      item.name,
      categoryLabel(item.category),
      formatQty(item.onHand),
      formatQty(item.reserved),
      formatQty(item.available),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  });

  if (opts.movements && opts.movements.length > 0) {
    const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Recent Stock Movements", 14, finalY);

    autoTable(doc, {
      startY: finalY + 5,
      head: [["Date", "Item", "Category", "Type", "Qty", "Note"]],
      body: opts.movements.map((m) => [
        new Date(m.date).toLocaleDateString(),
        m.itemName,
        categoryLabel(m.category),
        m.type,
        formatQty(m.qty),
        m.note || "-",
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });
  }

  const label =
    opts.stockCategory === "ALL"
      ? "All-Items"
      : opts.stockCategory.replace(/_/g, "-");
  doc.save(`Stock-Report-${label}-${new Date().toISOString().split("T")[0]}.pdf`);
}

export function filterByCategory<T extends { category: string }>(
  items: T[],
  category: ReportCategory
) {
  if (category === "ALL") return items;
  return items.filter((i) => i.category === category);
}

export type DateFilterType = "ALL_TIME" | "SINGLE_DAY" | "MONTH" | "YEAR" | "CUSTOM_RANGE";

export interface DateFilterState {
  type: DateFilterType;
  singleDay: string;
  month: string;
  year: string;
  fromDate: string;
  toDate: string;
}

export function buildMovementDateParams(filter: DateFilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (filter.type === "SINGLE_DAY" && filter.singleDay) {
    p.set("dateFrom", filter.singleDay);
    p.set("dateTo", `${filter.singleDay}T23:59:59`);
  } else if (filter.type === "MONTH" && filter.month && filter.year) {
    p.set("month", filter.month);
    p.set("year", filter.year);
  } else if (filter.type === "YEAR" && filter.year) {
    p.set("dateFrom", `${filter.year}-01-01`);
    p.set("dateTo", `${filter.year}-12-31`);
  } else if (filter.type === "CUSTOM_RANGE") {
    if (filter.fromDate) p.set("dateFrom", filter.fromDate);
    if (filter.toDate) p.set("dateTo", `${filter.toDate}T23:59:59`);
  }
  return p;
}

export function filterMovementsByDate<T extends { date: string }>(
  items: T[],
  filter: DateFilterState
): T[] {
  if (filter.type === "ALL_TIME") return items;
  return items.filter((m) => {
    const d = new Date(m.date);
    if (filter.type === "SINGLE_DAY" && filter.singleDay) {
      return m.date.startsWith(filter.singleDay);
    }
    if (filter.type === "MONTH" && filter.month && filter.year) {
      return d.getMonth() + 1 === Number(filter.month) && d.getFullYear() === Number(filter.year);
    }
    if (filter.type === "YEAR" && filter.year) {
      return d.getFullYear() === Number(filter.year);
    }
    if (filter.type === "CUSTOM_RANGE") {
      const t = d.getTime();
      const from = filter.fromDate ? new Date(filter.fromDate).getTime() : -Infinity;
      const to = filter.toDate ? new Date(`${filter.toDate}T23:59:59`).getTime() : Infinity;
      return t >= from && t <= to;
    }
    return true;
  });
}
