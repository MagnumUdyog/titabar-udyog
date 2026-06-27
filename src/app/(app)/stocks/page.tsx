"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RecentMovementsTable } from "@/components/stocks/recent-movements-table";
import { LowStockIndicator } from "@/components/stocks/low-stock-indicator";
import { BranchSelector } from "@/components/branch-selector";
import { StockReportDownloadModal } from "@/components/stocks/stock-report-download-modal";
import { api } from "@/lib/fetcher";
import {
  buildMovementDateParams,
  filterByCategory,
  filterMovementsByDate,
  generateStockReportPdf,
  type DateFilterState,
  type ReportCategory,
} from "@/lib/stock-report-pdf";
import { cn, formatQty, formatUnit } from "@/lib/utils";
import { SkeletonTable } from "@/components/ui/skeleton";

type Category = "RAW_MATERIAL" | "FINISHED_GOOD" | "TRADING_ITEM";
type TabKey = Category | "ALL";

const PAGE_SIZE = 50;
const MOVEMENTS_PAGE_SIZE = 20;

const TABS: { key: TabKey; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "RAW_MATERIAL", label: "Raw Materials" },
  { key: "FINISHED_GOOD", label: "Finished Goods" },
  { key: "TRADING_ITEM", label: "Trading Items" },
];

const defaultDateFilter = (): DateFilterState => ({
  type: "ALL_TIME",
  singleDay: "",
  month: "",
  year: new Date().getFullYear().toString(),
  fromDate: "",
  toDate: "",
});

function movementQueryParams(
  branchId: string,
  tab: TabKey,
  debouncedSearch: string,
  month: string,
  year: string,
  page: number,
  limit: number
) {
  const params = new URLSearchParams({
    branchId,
    page: String(page),
    limit: String(limit),
  });
  if (tab !== "ALL") params.set("category", tab);
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (month) params.set("month", month);
  if (year) params.set("year", year);
  return params;
}

export default function StocksPage() {
  const router = useRouter();
  const [branchId, setBranchId] = useState("");
  const [tab, setTab] = useState<TabKey>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [balances, setBalances] = useState<Array<Record<string, unknown>>>([]);
  const [movements, setMovements] = useState<Array<Record<string, unknown>>>([]);
  const [movementsPage, setMovementsPage] = useState(1);
  const [movementsHasMore, setMovementsHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [loadingMoreMovements, setLoadingMoreMovements] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfStockCategory, setPdfStockCategory] = useState<ReportCategory>("ALL");
  const [includeMovements, setIncludeMovements] = useState(false);
  const [pdfMovementCategory, setPdfMovementCategory] = useState<ReportCategory>("ALL");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(defaultDateFilter);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadBalances = useCallback(async () => {
    if (!branchId) {
      setBalances([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({
      branchId,
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (tab !== "ALL") params.set("category", tab);
    if (debouncedSearch) params.set("search", debouncedSearch);

    try {
      const data = await api<{
        balances: Array<Record<string, unknown>>;
        total: number;
      }>(`/api/stocks?${params}`);
      setBalances(data.balances);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [branchId, tab, debouncedSearch, page]);

  const loadMovements = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!branchId) {
        setMovements([]);
        setMovementsHasMore(false);
        return;
      }
      if (append) {
        setLoadingMoreMovements(true);
      } else {
        setMovementsLoading(true);
      }

      try {
        const params = movementQueryParams(
          branchId,
          tab,
          debouncedSearch,
          month,
          year,
          pageNum,
          MOVEMENTS_PAGE_SIZE
        );
        const data = await api<{
          movements: Array<Record<string, unknown>>;
          hasMore: boolean;
        }>(`/api/stocks/movements?${params}`);

        setMovements((prev) =>
          append ? [...prev, ...data.movements] : data.movements
        );
        setMovementsHasMore(data.hasMore);
        setMovementsPage(pageNum);
      } finally {
        setMovementsLoading(false);
        setLoadingMoreMovements(false);
      }
    },
    [branchId, tab, debouncedSearch, month, year]
  );

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  useEffect(() => {
    setMovementsPage(1);
    loadMovements(1, false);
  }, [loadMovements]);

  const downloadPdf = async () => {
    if (!branchId) return;
    setPdfLoading(true);
    try {
      const dateParams = buildMovementDateParams(dateFilter);
      const stockParams = new URLSearchParams({
        branchId,
        page: "1",
        limit: "2000",
        export: "true",
      });

      const movementParams = movementQueryParams(
        branchId,
        "ALL",
        "",
        dateParams.get("month") || "",
        dateParams.get("year") || dateFilter.year,
        1,
        2000
      );
      movementParams.set("export", "true");
      if (dateParams.get("dateFrom")) movementParams.set("dateFrom", dateParams.get("dateFrom")!);
      if (dateParams.get("dateTo")) movementParams.set("dateTo", dateParams.get("dateTo")!);

      const [stockData, movementData] = await Promise.all([
        api<{ balances: Array<Record<string, unknown>> }>(`/api/stocks?${stockParams}`),
        includeMovements
          ? api<{ movements: Array<Record<string, unknown>> }>(
              `/api/stocks/movements?${movementParams}`
            )
          : Promise.resolve({ movements: [] as Array<Record<string, unknown>> }),
      ]);

      const stock = filterByCategory(
        stockData.balances.map((b) => {
          const inv = b.inventoryItem as { name: string; unit: string };
          return {
            name: `${inv.name} (${formatUnit(inv.unit)})`,
            category: b.category as string,
            onHand: Number(b.onHandQty),
            reserved: Number(b.reservedQty),
            available: Number(b.availableQty),
          };
        }),
        pdfStockCategory
      );

      let movementRows;
      if (includeMovements) {
        const mapped = movementData.movements.map((m) => {
          const inv = m.inventoryItem as { name: string };
          return {
            date: m.createdAt as string,
            itemName: inv.name,
            category: m.category as string,
            type: m.movementType as string,
            qty: Number(m.quantity),
            note: (m.note as string) || "",
          };
        });
        movementRows = filterByCategory(
          filterMovementsByDate(mapped, dateFilter),
          pdfMovementCategory
        );
      }

      generateStockReportPdf({
        stock,
        movements: movementRows,
        stockCategory: pdfStockCategory,
        movementCategory: pdfMovementCategory,
      });
      setPdfModalOpen(false);
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Stock Status</h1>
          <p className="text-sm text-muted">Live stock balances and movement history</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="border-primary text-primary hover:bg-primary/5"
            onClick={() => setPdfModalOpen(true)}
            disabled={!branchId}
          >
            Download PDF
          </Button>
          <Button variant="secondary" onClick={() => router.push("/admin/stock-entry?dir=IN")}>
            Stock IN
          </Button>
          <Button variant="secondary" onClick={() => router.push("/admin/stock-entry?dir=OUT")}>
            Stock OUT
          </Button>
        </div>
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3">
        <BranchSelector value={branchId} onChange={(id) => { setBranchId(id); setPage(1); }} className="w-48" />
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
        <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-32">
          <option value="">All Months</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>
              {new Date(2000, i).toLocaleString("en", { month: "short" })}
            </option>
          ))}
        </Select>
        <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-24" placeholder="Year" />
      </div>

      {!branchId ? (
        <Card><p className="text-sm text-muted">Select a branch to view stock</p></Card>
      ) : (
        <>
          <Card title="Current Stock">
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH>Unit</TH>
                  <TH>Category</TH>
                  <TH>On Hand</TH>
                  <TH>Reserved</TH>
                  <TH>Available</TH>
                  <TH>Low Stock</TH>
                </TR>
              </THead>
              {loading ? (
                <SkeletonTable rows={10} cols={7} />
              ) : (
                <TBody>
                  {balances.map((b) => {
                  const inv = b.inventoryItem as { name: string; unit: string };
                  const available = Number(b.availableQty);
                  const moq = Number(b.moq ?? (b.inventoryItem as { moq?: number }).moq ?? 0);
                  return (
                    <TR key={b.id as string}>
                      <TD>{inv.name}</TD>
                      <TD className="text-muted">{formatUnit(inv.unit)}</TD>
                      <TD><Badge status={b.category as string} /></TD>
                      <TD>{formatQty(Number(b.onHandQty))}</TD>
                      <TD>{formatQty(Number(b.reservedQty))}</TD>
                      <TD className="font-medium">{formatQty(available)}</TD>
                      <TD>
                        <LowStockIndicator available={available} moq={moq} />
                      </TD>
                    </TR>
                  );
                })}
                </TBody>
              )}
            </Table>
            {!loading && total > PAGE_SIZE && (
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Prev
                </Button>
                <span className="text-sm text-muted">
                  Page {page} · {total} items
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page * PAGE_SIZE >= total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </Card>

          <Card title="Recent Movements">
            {movementsLoading ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Type</TH>
                    <TH>Item</TH>
                    <TH>Qty</TH>
                    <TH>By</TH>
                  </TR>
                </THead>
                <SkeletonTable rows={6} cols={5} />
              </Table>
            ) : (
              <>
                <RecentMovementsTable movements={movements} />
                {movementsHasMore && (
                  <div className="mt-3 flex justify-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={loadingMoreMovements}
                      onClick={() => loadMovements(movementsPage + 1, true)}
                    >
                      {loadingMoreMovements ? "Loading..." : "Load more"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}

      <StockReportDownloadModal
        open={pdfModalOpen}
        onClose={() => setPdfModalOpen(false)}
        stockCategory={pdfStockCategory}
        onStockCategoryChange={setPdfStockCategory}
        dateFilter={dateFilter}
        onDateFilterChange={setDateFilter}
        includeMovements={includeMovements}
        onIncludeMovementsChange={setIncludeMovements}
        movementCategory={pdfMovementCategory}
        onMovementCategoryChange={setPdfMovementCategory}
        onDownload={downloadPdf}
        loading={pdfLoading}
      />
    </div>
  );
}
