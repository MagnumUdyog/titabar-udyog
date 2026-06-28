import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatQty(qty: number | string) {
  const n = typeof qty === "string" ? parseFloat(qty) : qty;
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 4,
  }).format(n);
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value) || 0;
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

export function categoryLabel(category: string) {
  switch (category) {
    case "RAW_MATERIAL":
      return "Raw Material";
    case "FINISHED_GOOD":
      return "Finished Good";
    case "TRADING_ITEM":
      return "Trading Item";
    default:
      return category;
  }
}

export function formatUnit(unit: string | null | undefined) {
  return unit?.trim() ? unit : "—";
}

export function categorySearchLabel(category: string) {
  switch (category) {
    case "RAW_MATERIAL":
      return "Raw Material";
    case "FINISHED_GOOD":
      return "Finished Goods";
    case "TRADING_ITEM":
      return "Trading Item";
    default:
      return category;
  }
}

export function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function shortId(id: string, length = 6) {
  if (!id) return "";
  return id.length <= length ? id : id.slice(-length);
}
