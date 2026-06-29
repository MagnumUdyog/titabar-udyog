"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/fetcher";

interface Branch {
  id: string;
  name: string;
  code: string;
}

export function BranchSelector({
  value,
  onChange,
  className,
  allowAll = true,
  selectRef,
  onKeyDown,
}: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
  allowAll?: boolean;
  selectRef?: React.RefObject<HTMLSelectElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLSelectElement>) => void;
}) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api<{ user: { role: string; branchId: string | null } }>("/api/auth/me").then((d) => {
      setIsAdmin(d.user.role === "ADMIN");
      if (d.user.role === "BRANCH_USER" && d.user.branchId) {
        onChange(d.user.branchId);
      }
    });
    api<{ branches: Branch[] }>("/api/branches")
      .then((d) => setBranches(d.branches))
      .catch(() => {});
  }, [onChange]);

  useEffect(() => {
    if (allowAll || branches.length === 0) return;

    const valueIsValid = value && branches.some((branch) => branch.id === value);
    if (!valueIsValid) {
      onChange(branches[0].id);
    }
  }, [allowAll, branches, value, onChange]);

  if (!isAdmin && branches.length === 1) {
    return null;
  }

  return (
    <Select
      ref={selectRef}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    >
      {allowAll && isAdmin && <option value="">All Branches</option>}
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name} ({b.code})
        </option>
      ))}
    </Select>
  );
}
