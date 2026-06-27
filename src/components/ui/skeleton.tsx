import { cn } from "@/lib/utils";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded bg-gray-200", className)}
      style={{ minHeight: "16px" }}
    />
  );
}

export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <tbody className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </tbody>
  );
}

export function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
