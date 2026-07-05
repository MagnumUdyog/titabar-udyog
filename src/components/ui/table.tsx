import { cn } from "@/lib/utils";

export function Table({
  children,
  className,
  tableClassName,
}: {
  children: React.ReactNode;
  className?: string;
  tableClassName?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className={cn("w-full text-sm", tableClassName)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border bg-slate-50 text-left text-xs uppercase text-muted">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function TR({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("hover:bg-slate-50", className)} {...props}>
      {children}
    </tr>
  );
}

export function TH({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2 text-xs font-bold", className)}>{children}</th>;
}

export function TD({
  children,
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-3 py-2 text-sm font-medium", className)} {...props}>
      {children}
    </td>
  );
}
