export function isValidPriceInput(value: string): boolean {
  return value === "" || /^\d*\.?\d{0,2}$/.test(value);
}

export function parsePriceInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const num = parseFloat(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

export function normalizeOrderPrice(price?: number | null): number | null {
  if (price == null || price <= 0) return null;
  return price;
}

export function priceFromDb(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num;
}

export function formatOrderAmount(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

export function formatOrderPrice(price: number | null | undefined): string {
  if (price == null || price <= 0) return "—";
  return `₹${price.toFixed(2)}`;
}

export function orderLineTotal(
  qty: number,
  price: number | null | undefined
): number | null {
  if (price == null || price <= 0) return null;
  return qty * price;
}

export function orderGrandTotal(
  items: Array<{ quantity: number; price: number | null | undefined }>
): number {
  return items.reduce((sum, item) => {
    const line = orderLineTotal(Number(item.quantity), item.price);
    return sum + (line ?? 0);
  }, 0);
}

export function buildOrderItemPrices(quantity: number, price: number | null) {
  if (price == null) {
    return { price: null, lineTotal: null };
  }
  return { price, lineTotal: quantity * price };
}

export function sumOrderTotalAmount(
  items: Array<{ quantity: number; price: number | null }>
): number {
  return orderGrandTotal(items);
}
