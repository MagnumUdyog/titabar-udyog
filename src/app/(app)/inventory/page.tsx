"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { api, ApiError } from "@/lib/fetcher";
import { cn, formatUnit } from "@/lib/utils";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";

type Category = "RAW_MATERIAL" | "FINISHED_GOOD" | "TRADING_ITEM";
type TabKey = Category | "ALL";

interface Item {
  id: string;
  name: string;
  category: Category;
  subHeading: string;
  unit: string | null;
  moq: number;
  isActive: boolean;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "RAW_MATERIAL", label: "Raw Materials" },
  { key: "FINISHED_GOOD", label: "Finished Goods" },
  { key: "TRADING_ITEM", label: "Trading Items" },
];

export default function InventoryPage() {
  const [tab, setTab] = useState<TabKey>("ALL");
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | "import" | null>(null);
  const [editItem, setEditItem] = useState<Partial<Item>>({});
  const [importResult, setImportResult] = useState("");
  const [importErrors, setImportErrors] = useState<Array<{ rowNumber: number; message: string; itemName?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percent: 0 });
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [masterListUnlocked, setMasterListUnlocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    api<{ user: { role: string }; masterListUnlocked: boolean }>("/api/auth/me")
      .then((d) => {
        setIsAdmin(d.user.role === "ADMIN");
        setMasterListUnlocked(d.masterListUnlocked);
      })
      .finally(() => setAuthReady(true));
  }, []);

  const canViewMasterList = isAdmin || masterListUnlocked;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError("");
    setUnlocking(true);
    try {
      await api("/api/auth/master-list-unlock", {
        method: "POST",
        body: JSON.stringify({ password: unlockPassword }),
      });
      setMasterListUnlocked(true);
      setUnlockPassword("");
    } catch (err) {
      setUnlockError(
        err instanceof ApiError ? err.message : "Incorrect admin password"
      );
    } finally {
      setUnlocking(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page: String(page), limit: "50" });
      if (tab !== "ALL") params.set("category", tab);
      const data = await api<{ items: Item[]; total: number }>(
        `/api/inventory/items?${params}`
      );
      setItems(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [tab, search, page]);

  useEffect(() => {
    if (!canViewMasterList) return;
    load();
  }, [load, canViewMasterList]);

  const saveItem = async () => {
    if (modal === "add") {
      await api("/api/inventory/items", {
        method: "POST",
        body: JSON.stringify({
          name: editItem.name,
          category: editItem.category || "TRADING_ITEM",
          subHeading: editItem.subHeading || "GENERAL",
          unit: editItem.unit?.trim() || null,
          moq: editItem.moq ?? 0,
        }),
      });
    } else if (modal === "edit" && editItem.id) {
      await api(`/api/inventory/items/${editItem.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editItem.name,
          subHeading: editItem.subHeading,
          unit: editItem.unit?.trim() || null,
          moq: editItem.moq ?? 0,
        }),
      });
    }
    setModal(null);
    setEditItem({});
    load();
  };

  const updateMoq = async (id: string, moq: number) => {
    if (moq < 0) return;
    await api(`/api/inventory/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ moq }),
    });
    load();
  };

  const updateUnit = async (id: string, unit: string) => {
    await api(`/api/inventory/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ unit: unit.trim() || null }),
    });
    load();
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Deactivate this item?")) return;
    await api(`/api/inventory/items/${id}`, { method: "DELETE" });
    load();
  };

  const handleImport = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setUploading(true);
    setImportResult("");
    setImportErrors([]);
    setProgress({ current: 0, total: 0, percent: 0 });

    const finishImport = (data: {
      successRows?: number;
      failedRows?: number;
      errors?: typeof importErrors;
      error?: string;
    }) => {
      if (data.error) {
        setImportResult(data.error);
        return;
      }
      setImportResult(`Imported ${data.successRows ?? 0} rows. Failed: ${data.failedRows ?? 0}`);
      setImportErrors(data.errors ?? []);
      load();
    };

    try {
      const streamRes = await fetch("/api/inventory/import", {
        method: "POST",
        credentials: "include",
        body: (() => {
          formData.set("stream", "true");
          return formData;
        })(),
      });

      if (!streamRes.ok) {
        const data = await streamRes.json().catch(() => ({}));
        setImportResult((data as { error?: string }).error || `Import failed (${streamRes.status})`);
        return;
      }

      const contentType = streamRes.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        finishImport(await streamRes.json());
        return;
      }

      const reader = streamRes.body?.getReader();
      if (!reader) {
        setImportResult("Import failed: no response stream");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6)) as {
            current?: number;
            total?: number;
            percent?: number;
            done?: boolean;
            successRows?: number;
            failedRows?: number;
            errors?: typeof importErrors;
            error?: string;
          };

          if (data.error) {
            setImportResult(data.error);
            return;
          }
          if (data.current != null && data.total != null) {
            setProgress({
              current: data.current,
              total: data.total,
              percent: data.percent ?? Math.round((data.current / data.total) * 100),
            });
          }
          if (data.done) {
            completed = true;
            finishImport(data);
          }
        }
      }

      if (!completed) {
        setImportResult(
          "Import timed out before finishing. Deploy the latest version and try again, or import a smaller file."
        );
      }
    } catch {
      setImportResult("Import failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  };

  if (!authReady) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-full max-w-xl" />
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Heading</TH>
                <TH>Sub-Heading</TH>
                <TH>Item Name</TH>
                <TH>Unit</TH>
                <TH>MOQ</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <SkeletonTable rows={8} cols={6} />
          </Table>
        </Card>
      </div>
    );
  }

  if (!canViewMasterList) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center justify-center py-16">
        <div className="w-full rounded-lg border border-border bg-white p-6 shadow-sm">
          <h1 className="text-center text-xl font-bold">Master List</h1>
          <p className="mt-2 text-center text-sm text-muted">
            Enter the admin password to open the master list.
          </p>
          <form onSubmit={handleUnlock} className="mt-6 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Admin password
              </label>
              <Input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                autoFocus
                required
                placeholder="Enter admin password"
              />
            </div>
            {unlockError && (
              <p className="text-sm text-red-600">{unlockError}</p>
            )}
            <Button type="submit" className="w-full" disabled={unlocking}>
              {unlocking ? "Verifying..." : "Unlock Master List"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Master List</h1>
          <p className="text-sm text-muted">{total} items</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button variant="secondary" onClick={() => { setModal("import"); setImportResult(""); setImportErrors([]); }}>
              Import Excel
            </Button>
          )}
          <Button onClick={() => { setModal("add"); setEditItem({ category: "TRADING_ITEM", subHeading: "GENERAL", moq: 0 }); }}>
            Add Item
          </Button>
        </div>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3">
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setPage(1); }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                tab === t.key ? "bg-primary text-white" : "bg-slate-100"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Input
          placeholder="Search name or sub-heading..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-56"
        />
      </div>

      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Heading</TH>
              <TH>Sub-heading</TH>
              <TH>Item Name</TH>
              <TH>Unit</TH>
              <TH>MOQ</TH>
              <TH>Actions</TH>
            </TR>
          </THead>
          {loading ? (
            <SkeletonTable rows={8} cols={6} />
          ) : (
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD><Badge status={item.category} /></TD>
                  <TD className="text-muted">{item.subHeading}</TD>
                  <TD className="font-medium">{item.name}</TD>
                  <TD>
                    {isAdmin ? (
                      <Input
                        defaultValue={item.unit ?? ""}
                        placeholder="—"
                        className="h-8 w-24"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (item.unit ?? "")) updateUnit(item.id, v);
                        }}
                      />
                    ) : (
                      formatUnit(item.unit)
                    )}
                  </TD>
                  <TD>
                    {isAdmin ? (
                      <Input
                        type="number"
                        defaultValue={item.moq ?? 0}
                        className="h-8 w-20"
                        onBlur={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!Number.isNaN(v) && v >= 0 && v !== item.moq) updateMoq(item.id, v);
                        }}
                      />
                    ) : (
                      item.moq ?? 0
                    )}
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditItem(item); setModal("edit"); }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteItem(item.id)}>
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          )}
        </Table>
        {!loading && total > 50 && (
          <div className="mt-3 flex justify-center gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
            <span className="text-sm text-muted">Page {page}</span>
            <Button size="sm" variant="secondary" disabled={page * 50 >= total} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </Card>

      <Modal
        open={modal === "add" || modal === "edit"}
        onClose={() => setModal(null)}
        title={modal === "add" ? "Add Item" : "Edit Item"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={saveItem}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          {modal === "add" && (
            <div>
              <label className="text-xs font-medium">Heading</label>
              <Select
                value={editItem.category || "TRADING_ITEM"}
                onChange={(e) => setEditItem({ ...editItem, category: e.target.value as Category })}
              >
                <option value="RAW_MATERIAL">Raw Materials</option>
                <option value="FINISHED_GOOD">Finished Goods</option>
                <option value="TRADING_ITEM">Trading Items</option>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium">Sub-heading</label>
            <Input value={editItem.subHeading || ""} onChange={(e) => setEditItem({ ...editItem, subHeading: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium">Item Name</label>
            <Input value={editItem.name || ""} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium">Unit (optional)</label>
            <Input value={editItem.unit ?? ""} onChange={(e) => setEditItem({ ...editItem, unit: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium">MOQ</label>
            <Input type="number" min={0} value={editItem.moq ?? 0} onChange={(e) => setEditItem({ ...editItem, moq: parseInt(e.target.value, 10) || 0 })} />
          </div>
        </div>
      </Modal>

      <Modal open={modal === "import"} onClose={() => setModal(null)} title="Import from Excel">
        <form onSubmit={handleImport} className="space-y-3">
          <p className="text-xs text-muted">
            Row 1: HEADING | SUB-HEADING | ITEM NAME | UNIT (cols 0, 2, 4, 6). Data from row 3.
          </p>
          <input type="file" name="file" accept=".xlsx,.xls" required className="text-sm" />
          <Select name="mode" defaultValue="replace">
            <option value="replace">Replace all master items</option>
            <option value="append">Append / update existing</option>
          </Select>
          {uploading && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-sm">
                <span>Importing master list...</span>
                <span className="font-bold">{progress.percent}%</span>
              </div>
              <div className="h-2 rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                {progress.current} / {progress.total} items imported
              </p>
            </div>
          )}
          {importResult && <p className="text-sm">{importResult}</p>}
          {importErrors.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-red-600">
                {importErrors.length} failed row(s) — click for details
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted">
                {importErrors.map((err, i) => (
                  <li key={i}>
                    Row {err.rowNumber}
                    {err.itemName ? ` (${err.itemName})` : ""}: {err.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Button type="submit" disabled={uploading}>{uploading ? "Importing..." : "Upload"}</Button>
        </form>
      </Modal>
    </div>
  );
}
