"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  Warehouse,
  ShoppingCart,
  Settings,
  LogOut,
  FileSpreadsheet,
  ArrowDownUp,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/fetcher";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { href: "/admin/stock-entry", label: "IN-OUT", icon: <ArrowDownUp size={18} /> },
  { href: "/orders/new", label: "Create Order", icon: <FileSpreadsheet size={18} /> },
  { href: "/orders", label: "Orders", icon: <ShoppingCart size={18} /> },
  { href: "/stocks", label: "Stock Status", icon: <Warehouse size={18} /> },
  { href: "/notifications", label: "Notifications", icon: <Bell size={18} /> },
  { href: "/inventory", label: "Master List", icon: <Package size={18} /> },
  { href: "/branches", label: "Settings", icon: <Settings size={18} />, adminOnly: true },
];

export function Sidebar({
  user,
}: {
  user: { name: string; role: string; branchId?: string | null; branchName?: string | null };
}) {
  const pathname = usePathname();
  const [lowStockCount, setLowStockCount] = useState(0);
  const [badgeLoading, setBadgeLoading] = useState(true);

  useEffect(() => {
    setBadgeLoading(true);
    const params = user.branchId ? `?branchId=${user.branchId}` : "";
    api<{ count: number }>(`/api/notifications/low-stock${params}`)
      .then((d) => setLowStockCount(d.count))
      .catch(() => setLowStockCount(0))
      .finally(() => setBadgeLoading(false));
  }, [user.branchId]);

  const handleLogout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const items = navItems.filter((item) => !item.adminOnly || user.role === "ADMIN");

  return (
    <aside className="no-print sticky top-0 flex h-screen w-56 shrink-0 flex-col overflow-hidden border-r border-border bg-white">
      <div className="shrink-0 border-b border-border px-4 py-4">
        <h1 className="text-sm font-bold text-primary">Titiabar Udyog</h1>
        <p className="text-xs text-muted">Inventory & Orders</p>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-hidden p-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              pathname === item.href || pathname.startsWith(item.href + "/")
                ? "bg-primary/10 font-medium text-primary"
                : "text-slate-700 hover:bg-slate-50"
            )}
          >
            {item.icon}
            <span className="flex flex-1 items-center">
              {item.label}
              {item.href === "/notifications" && badgeLoading && (
                <span className="ml-2 inline-block h-4 w-6 animate-pulse rounded-full bg-gray-200" />
              )}
              {item.href === "/notifications" && !badgeLoading && lowStockCount > 0 && (
                <span className="ml-2 rounded-full bg-red-600 px-1.5 py-px text-[11px] font-bold text-white">
                  {lowStockCount}
                </span>
              )}
            </span>
          </Link>
        ))}
      </nav>
      <div className="mt-auto shrink-0 border-t border-border p-4">
        <p className="text-sm font-medium">{user.name}</p>
        <p className="text-xs text-muted">
          {user.role === "ADMIN" ? "Administrator" : user.branchName || "Branch User"}
        </p>
        <button
          onClick={handleLogout}
          className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-danger"
        >
          <LogOut size={14} /> Logout
        </button>
      </div>
    </aside>
  );
}
