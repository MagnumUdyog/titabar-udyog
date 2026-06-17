import { StockCategory } from "@prisma/client";
import { prisma } from "./db";
import { StockError } from "./stock";

export interface OrderItemInput {
  inventoryItemId?: string;
  itemName?: string;
  category?: StockCategory;
  quantity: number;
}

export async function resolveOrderItems(items: OrderItemInput[]) {
  const resolved: Array<{
    inv: { id: string; name: string; unit: string | null; category: StockCategory };
    quantity: number;
  }> = [];

  const ids = items
    .map((i) => i.inventoryItemId)
    .filter((id): id is string => Boolean(id));
  const names = items
    .filter((i) => !i.inventoryItemId && i.itemName?.trim())
    .map((i) => i.itemName!.trim());

  const [byId, byName] = await Promise.all([
    ids.length > 0
      ? prisma.inventoryItem.findMany({ where: { id: { in: ids } } })
      : Promise.resolve([]),
    names.length > 0
      ? prisma.inventoryItem.findMany({ where: { name: { in: names } } })
      : Promise.resolve([]),
  ]);

  const idMap = new Map(byId.map((inv) => [inv.id, inv]));
  const nameMap = new Map<string, (typeof byName)[number]>();
  for (const inv of byName) {
    if (!nameMap.has(inv.name)) nameMap.set(inv.name, inv);
  }

  for (const item of items) {
    let inv;
    if (item.inventoryItemId) {
      inv = idMap.get(item.inventoryItemId);
      if (!inv) throw new StockError(`Item ${item.inventoryItemId} not found`);
    } else if (item.itemName?.trim()) {
      const name = item.itemName.trim();
      inv = nameMap.get(name);
      if (!inv) {
        inv = await prisma.inventoryItem.create({
          data: {
            name,
            category: item.category || "TRADING_ITEM",
            unit: null,
            subHeading: "GENERAL",
          },
        });
        nameMap.set(name, inv);
      }
    } else {
      throw new StockError("Each line needs an item from inventory or a name");
    }

    resolved.push({ inv, quantity: item.quantity });
  }

  return resolved;
}
